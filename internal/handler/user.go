package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/internal/service"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type UserHandler struct {
}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

func (h *UserHandler) GetAPIKey(c *gin.Context) {
	userID := c.GetUint("userID")
	user, err := repository.GetUserByID(userID)
	if err != nil {
		response.Error(c, "用户不存在")
		return
	}

	response.Success(c, gin.H{
		"api_key": user.APIKey,
	})
}

func (h *UserHandler) GetProfile(c *gin.Context) {
	userID := c.GetUint("userID")
	user, err := repository.GetUserByID(userID)
	if err != nil {
		response.Error(c, "用户不存在")
		return
	}

	response.Success(c, gin.H{
		"id":            user.ID,
		"username":      user.Username,
		"role":          user.Role,
		"can_edit_tmdb": user.CanEditTMDB,
		"created_at":    user.CreatedAt,
	})
}

func (h *UserHandler) GetStats(c *gin.Context) {
	userID := c.GetUint("userID")
	stats, err := repository.GetUserMediaStats(userID)
	if err != nil {
		response.Error(c, "获取统计失败")
		return
	}

	response.Success(c, gin.H{
		"total_files": stats.TotalFiles,
		"total_shows": stats.TotalShows,
		"total_size":  stats.TotalSize,
		"by_type":     stats.ByType,
	})
}

func (h *UserHandler) ResetAPIKey(c *gin.Context) {
	userID := c.GetUint("userID")
	newKey := service.GenerateAPIKey()

	if err := repository.UpdateUser(userID, map[string]any{"api_key": newKey}); err != nil {
		response.Error(c, "重置 API Key 失败")
		return
	}

	response.Success(c, gin.H{
		"api_key": newKey,
	})
}
