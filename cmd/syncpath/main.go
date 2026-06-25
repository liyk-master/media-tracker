package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"time"

	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/service"
	"gopkg.in/yaml.v2"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func main() {
	yamlFile, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		log.Fatalf("读取配置文件失败: %v", err)
	}
	if err := yaml.Unmarshal(yamlFile, config.Conf); err != nil {
		log.Fatalf("解析配置文件失败: %v", err)
	}

	dsn := config.Conf.Database.DSN()
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
		},
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("获取数据库对象失败: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("数据库连接 ping 失败: %v", err)
	}
	config.Conf.DB = db

	identifier := service.NewIdentifierService()

	var records []model.Media
	if err := db.Model(&model.Media{}).
		Where("JSON_EXTRACT(json_data, '$.suggested_path') IS NULL").
		Order("id ASC").
		Find(&records).Error; err != nil {
		log.Fatalf("查询记录失败: %v", err)
	}

	log.Printf("找到 %d 条缺少 suggested_path 的记录", len(records))

	type summary struct {
		ID            uint
		FileName      string
		SuggestedPath string
	}
	var updated []summary

	for _, m := range records {
		result, err := identifier.Identify(m.FileName, "")
		if err != nil {
			log.Printf("  识别失败 id=%d file=%s: %v", m.ID, m.FileName, err)
			continue
		}

		if result.SuggestedPath == "" {
			log.Printf("  跳过 id=%d file=%s: API 未返回 suggested_path", m.ID, m.FileName)
			continue
		}

		var jsonDataMap map[string]any
		if len(m.JsonData) > 0 {
			json.Unmarshal([]byte(m.JsonData), &jsonDataMap)
		}
		if jsonDataMap == nil {
			jsonDataMap = make(map[string]any)
		}

		jsonDataMap["suggested_path"] = result.SuggestedPath

		if result.TmdbInfo != nil {
			jsonDataMap["tmdb_info"] = result.TmdbInfo
			jsonDataMap["tmdb_matched"] = result.TmdbMatched
			jsonDataMap["success"] = true
			jsonDataMap["confidence"] = 1.0

			if title, ok := result.TmdbInfo["title"].(string); ok && title != "" {
				jsonDataMap["title"] = title
			} else if name, ok := result.TmdbInfo["name"].(string); ok && name != "" {
				jsonDataMap["title"] = name
			}

			if y, ok := result.TmdbInfo["year"].(float64); ok && y > 0 {
				jsonDataMap["year"] = int(y)
			} else if yStr, ok := result.TmdbInfo["year"].(string); ok && yStr != "" {
				var y int
				if _, err := fmt.Sscanf(yStr, "%d", &y); err == nil {
					jsonDataMap["year"] = y
				}
			} else if rd, ok := result.TmdbInfo["release_date"].(string); ok && rd != "" {
				var y int
				if _, err := fmt.Sscanf(rd, "%d", &y); err == nil {
					jsonDataMap["year"] = y
				}
			} else if fad, ok := result.TmdbInfo["first_air_date"].(string); ok && fad != "" {
				var y int
				if _, err := fmt.Sscanf(fad, "%d", &y); err == nil {
					jsonDataMap["year"] = y
				}
			}

			if title, ok := jsonDataMap["title"].(string); ok && title != "" {
				if year, ok := jsonDataMap["year"].(int); ok && year > 0 {
					jsonDataMap["suggested_name"] = fmt.Sprintf("%s (%d).mp4", title, year)
				} else {
					jsonDataMap["suggested_name"] = fmt.Sprintf("%s.mp4", title)
				}
			}

			if result.MediaType != "" {
				newMediaType := result.MediaType
				updates := map[string]any{
					"json_data":  model.JSON(rawJSON(jsonDataMap)),
					"media_type": newMediaType,
				}
				if result.TmdbMatched {
					switch v := result.TmdbInfo["id"].(type) {
					case float64:
						updates["tmdb_id"] = int(v)
					case string:
						var tid int
						if _, err := fmt.Sscanf(v, "%d", &tid); err == nil {
							updates["tmdb_id"] = tid
						}
					}
				}
				if err := db.Model(&model.Media{}).Where("id = ?", m.ID).Updates(updates).Error; err != nil {
					log.Printf("  更新失败 id=%d: %v", m.ID, err)
					continue
				}
			} else {
				raw, _ := json.Marshal(jsonDataMap)
				if err := db.Model(&model.Media{}).Where("id = ?", m.ID).Update("json_data", model.JSON(raw)).Error; err != nil {
					log.Printf("  更新失败 id=%d: %v", m.ID, err)
					continue
				}
			}
		} else {
			raw, _ := json.Marshal(jsonDataMap)
			if err := db.Model(&model.Media{}).Where("id = ?", m.ID).Update("json_data", model.JSON(raw)).Error; err != nil {
				log.Printf("  更新失败 id=%d: %v", m.ID, err)
				continue
			}
		}

		updated = append(updated, summary{
			ID:            m.ID,
			FileName:      m.FileName,
			SuggestedPath: result.SuggestedPath,
		})
		log.Printf("  [%d] %s -> %s", m.ID, m.FileName, result.SuggestedPath)
	}

	log.Printf("=== 完成 ===")
	log.Printf("更新: %d 条", len(updated))

	log.Printf("等待 5 秒确保所有请求完成...")
	time.Sleep(5 * time.Second)
}

func rawJSON(data map[string]any) []byte {
	raw, _ := json.Marshal(data)
	return raw
}
