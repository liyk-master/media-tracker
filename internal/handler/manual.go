package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/service"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type ManualHandler struct {
	identifierService *service.IdentifierService
}

func NewManualHandler(identifierService *service.IdentifierService) *ManualHandler {
	return &ManualHandler{identifierService: identifierService}
}

func (h *ManualHandler) Validate(c *gin.Context) {
	var req struct {
		FilePath  string `json:"file_path"`
		MediaType string `json:"media_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	result, err := h.identifierService.Identify(req.FilePath, req.MediaType)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, result)
}
