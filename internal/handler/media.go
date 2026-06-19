package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/model"
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

func (h *MediaHandler) Export(c *gin.Context) {
	q := c.Query("q")
	mediaType := c.Query("media_type")
	tmdbID, _ := strconv.Atoi(c.Query("tmdb_id"))
	tmdbIDsStr := c.Query("tmdb_ids")

	var list []model.Media

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
		exportList = append(exportList, exportItem{
			Sha256: m.Sha256,
			Size:   m.FileSize,
			Name:   m.FileName,
			Cloud:  m.CloudType,
		})
	}

	raw, err := json.Marshal(exportList)
	if err != nil {
		response.Error(c, "序列化失败: "+err.Error())
		return
	}

	c.Header("Content-Disposition", "attachment; filename=media_export.json")
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
