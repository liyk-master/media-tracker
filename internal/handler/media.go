package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/pkg/yun139"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type exportItem struct {
	Sha256 string `json:"sha256"`
	Size   int64  `json:"size"`
	Name   string `json:"name"`
	Cloud  string `json:"cloud"`
}

type MediaHandler struct {
}

func NewMediaHandler() *MediaHandler {
	return &MediaHandler{}
}

func (h *MediaHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	q := c.Query("q")
	mediaType := c.Query("media_type")
	tmdbID, _ := strconv.Atoi(c.Query("tmdb_id"))
	groupBy := c.Query("group_by")
	year, _ := strconv.Atoi(c.Query("year"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	if groupBy == "tmdb" {
		items, total, err := repository.ListMediaGrouped(page, pageSize, q, mediaType, year, tmdbID)
		if err != nil {
			response.Error(c, "查询失败: "+err.Error())
			return
		}
		response.Success(c, gin.H{
			"total":     total,
			"page":      page,
			"page_size": pageSize,
			"items":     items,
		})
		return
	}

	list, total, err := repository.ListMedia(page, pageSize, q, mediaType, tmdbID, year)
	if err != nil {
		response.Error(c, "查询失败: "+err.Error())
		return
	}

	response.Success(c, gin.H{
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"items":     list,
	})
}

func (h *MediaHandler) GetByID(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if id == 0 {
		response.Error(c, "无效的 ID")
		return
	}
	m, err := repository.GetMediaByID(uint(id))
	if err != nil {
		response.Error(c, "查询失败: "+err.Error())
		return
	}
	if m == nil {
		response.Error(c, "记录不存在")
		return
	}
	response.Success(c, m)
}

func (h *MediaHandler) GetLeaderboard(c *gin.Context) {
	list, err := repository.GetLeaderboard()
	if err != nil {
		response.Error(c, "获取排行榜失败: "+err.Error())
		return
	}
	response.Success(c, gin.H{
		"items": list,
	})
}

func extractSuggestedPath(jsonData model.JSON) string {
	if len(jsonData) == 0 {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return ""
	}
	if path, ok := data["suggested_path"].(string); ok && path != "" {
		return path
	}
	return ""
}

func extractSuggestedName(jsonData model.JSON, fallback string) string {
	if len(jsonData) == 0 {
		return fallback
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return fallback
	}
	if name, ok := data["suggested_name"].(string); ok && name != "" {
		return name
	}
	return fallback
}

func (h *MediaHandler) Export(c *gin.Context) {
	q := c.Query("q")
	mediaType := c.Query("media_type")
	tmdbID, _ := strconv.Atoi(c.Query("tmdb_id"))
	tmdbIDsStr := c.Query("tmdb_ids")

	var list []model.MediaWithUser

	if tmdbIDsStr != "" {
		parts := strings.Split(tmdbIDsStr, ",")
		tmdbIDs := make([]int, 0, len(parts))
		for _, p := range parts {
			id, err := strconv.Atoi(strings.TrimSpace(p))
			if err == nil && id > 0 {
				tmdbIDs = append(tmdbIDs, id)
			}
		}
		l, err := repository.ListMediaByTmdbIDs(tmdbIDs)
		if err != nil {
			response.Error(c, "导出失败: "+err.Error())
			return
		}
		list = l
	} else if idsStr := c.Query("ids"); idsStr != "" {
		parts := strings.Split(idsStr, ",")
		ids := make([]uint, 0, len(parts))
		for _, p := range parts {
			id, err := strconv.ParseUint(strings.TrimSpace(p), 10, 64)
			if err == nil && id > 0 {
				ids = append(ids, uint(id))
			}
		}
		l, err := repository.ListMediaByIDs(ids)
		if err != nil {
			response.Error(c, "导出失败: "+err.Error())
			return
		}
		list = l
	} else {
		var err error
		list, err = repository.ListAllMedia(q, mediaType, tmdbID, 0, 0)
		if err != nil {
			response.Error(c, "导出失败: "+err.Error())
			return
		}
	}

	exportList := make([]exportItem, 0, len(list))
	for _, m := range list {
		suggestedPath := extractSuggestedPath(m.JsonData)
		name := suggestedPath
		if name == "" {
			name = extractSuggestedName(m.JsonData, m.FileName)
		}
		exportList = append(exportList, exportItem{
			Sha256: m.Sha256,
			Size:   m.FileSize,
			Name:   name,
			Cloud:  m.CloudType,
		})
	}

	raw, err := json.Marshal(exportList)
	if err != nil {
		response.Error(c, "序列化失败: "+err.Error())
		return
	}

	filename := "media_export.json"
	if len(list) == 1 {
		m := list[0]
		suggestedPath := extractSuggestedPath(m.JsonData)
		if suggestedPath != "" {
			if idx := strings.LastIndex(suggestedPath, "."); idx > 0 {
				filename = suggestedPath[:idx] + ".json"
			} else {
				filename = suggestedPath + ".json"
			}
		} else {
			suggestedName := extractSuggestedName(m.JsonData, "")
			if suggestedName != "" {
				if idx := strings.LastIndex(suggestedName, "."); idx > 0 {
					filename = suggestedName[:idx] + ".json"
				} else {
					filename = suggestedName + ".json"
				}
			}
		}
	}

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)

	go func() {
		userID, _ := c.Get("userID")
		userIDUint, ok := userID.(uint)
		if !ok {
			return
		}
		user, err := repository.GetUserByID(userIDUint)
		if err != nil {
			return
		}
		paramMap := map[string]string{}
		if q != "" {
			paramMap["q"] = q
		}
		if mediaType != "" {
			paramMap["media_type"] = mediaType
		}
		if tmdbID > 0 {
			paramMap["tmdb_id"] = strconv.Itoa(tmdbID)
		}
		if idsStr := c.Query("ids"); idsStr != "" {
			paramMap["ids"] = idsStr
		}
		if tmdbIDsStr != "" {
			paramMap["tmdb_ids"] = tmdbIDsStr
		}
		paramBytes, _ := json.Marshal(paramMap)
		repository.CreateExportLog(&model.ExportLog{
			UserID:    userIDUint,
			Username:  user.Username,
			ItemCount: len(list),
			Params:    string(paramBytes),
		})
	}()
}

var playCache = yun139.NewCache(300)

func (h *MediaHandler) GetPlayURL(c *gin.Context) {
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "*")

	if c.Request.Method == "OPTIONS" {
		c.AbortWithStatus(http.StatusNoContent)
		return
	}

	if !config.Conf.Player.Enabled {
		response.Error(c, "播放功能未启用")
		return
	}

	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if id == 0 {
		response.Error(c, "无效的 ID")
		return
	}
	m, err := repository.GetMediaByID(uint(id))
	if err != nil {
		response.Error(c, "查询失败: "+err.Error())
		return
	}
	if m == nil {
		response.Error(c, "媒体不存在")
		return
	}

	authToken := c.GetHeader("X-Player-Token")
	if authToken == "" {
		authToken = c.Query("auth_token")
	}
	if authToken == "" {
		response.Error(c, "缺少 auth_token")
		return
	}

	cacheKey := fmt.Sprintf("%s:%s", authToken[:min(10, len(authToken))], m.Sha256)
	if cachedURL, ok := playCache.Get(cacheKey); ok {
		c.Redirect(http.StatusFound, cachedURL)
		return
	}

	parentID := c.Query("parent_id")
	if parentID == "" {
		parentID = "/"
	}

	client, err := yun139.NewClient(authToken, parentID)
	if err != nil {
		response.Error(c, "auth_token 格式错误: "+err.Error())
		return
	}

	filename := filepath.Base(m.FileName)

	fileId, err := client.RapidUpload(m.Sha256, m.FileSize, filename)
	if err != nil {
		response.Error(c, "秒传失败: "+err.Error())
		return
	}

	downloadURL, err := client.GetDownloadURL(fileId)
	if err != nil {
		response.Error(c, "获取下载链接失败: "+err.Error())
		return
	}

	playCache.Set(cacheKey, downloadURL)

	c.Header("Cache-Control", "max-age=300")
	c.Header("Referrer-Policy", "no-referrer")
	c.Redirect(http.StatusFound, downloadURL)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
