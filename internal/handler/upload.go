package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/service"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type UploadHandler struct {
	uploadService *service.UploadService
}

func NewUploadHandler(uploadService *service.UploadService) *UploadHandler {
	return &UploadHandler{uploadService: uploadService}
}

func (h *UploadHandler) Upload(c *gin.Context) {
	userID := c.GetUint("userID")

	var req service.UploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	result, err := h.uploadService.Submit(userID, &req)
	if err != nil {
		response.Error(c, err.Error())
		return
	}
	response.Success(c, result)
}

func (h *UploadHandler) UploadBatch(c *gin.Context) {
	userID := c.GetUint("userID")

	var reqs []service.UploadRequest
	if err := c.ShouldBindJSON(&reqs); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	result := h.uploadService.SubmitBatch(userID, reqs)
	response.Success(c, result)
}

func (h *UploadHandler) UploadFile(c *gin.Context) {
	userID := c.GetUint("userID")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.Error(c, "请上传文件")
		return
	}
	defer file.Close()

	result, err := h.processFileUpload(userID, file, header)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, result)
}

func (h *UploadHandler) UpdateTMDB(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, "无效的媒体ID")
		return
	}

	var req struct {
		TMDBID    int    `json:"tmdb_id"`
		MediaType string `json:"media_type"`
		OldTmdbID int    `json:"old_tmdb_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	updated, err := h.uploadService.UpdateTMDBID(uint(id), req.TMDBID, req.MediaType, req.OldTmdbID)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, updated)
}

func (h *UploadHandler) ResendNewMedia(c *gin.Context) {
	userID := c.GetUint("userID")

	var req struct {
		IDs       []uint `json:"ids"`
		TmdbIDs   []int  `json:"tmdb_ids"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	count, err := h.uploadService.ResendNewMedia(userID, req.IDs, req.TmdbIDs, req.StartTime, req.EndTime)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, gin.H{"count": count})
}

func (h *UploadHandler) processFileUpload(userID uint, file multipart.File, header *multipart.FileHeader) (*service.SubmitResult, error) {
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	var single service.UploadRequest
	if err := json.Unmarshal(data, &single); err == nil && single.Sha256 != "" {
		return h.uploadService.Submit(userID, &single)
	}

	var batch []service.UploadRequest
	if err := json.Unmarshal(data, &batch); err != nil {
		return nil, fmt.Errorf("JSON 解析失败: %w", err)
	}

	return h.uploadService.SubmitBatch(userID, batch), nil
}
