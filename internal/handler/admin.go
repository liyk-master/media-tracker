package handler

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type AdminHandler struct{}

func NewAdminHandler() *AdminHandler {
	return &AdminHandler{}
}

type CreateInvitationReq struct {
	ExpireHours int `json:"expire_hours" binding:"required,min=1"`
	Count       int `json:"count" binding:"required,min=1,max=100"`
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := repository.ListUsers()
	if err != nil {
		response.Error(c, "查询用户失败")
		return
	}
	response.Success(c, gin.H{"users": users})
}

func (h *AdminHandler) CreateInvitation(c *gin.Context) {
	var req CreateInvitationReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	userID := c.GetUint("userID")
	expiresAt := time.Now().Add(time.Duration(req.ExpireHours) * time.Hour)

	type result struct {
		Code      string `json:"code"`
		ExpiresAt string `json:"expires_at"`
	}
	var results []result

	for i := 0; i < req.Count; i++ {
		b := make([]byte, 12)
		rand.Read(b)
		code := hex.EncodeToString(b)

		inv := &model.Invitation{
			Code:      code,
			CreatedBy: userID,
			ExpiresAt: expiresAt,
		}
		if err := repository.CreateInvitation(inv); err != nil {
			continue
		}
		results = append(results, result{
			Code:      code,
			ExpiresAt: expiresAt.Format("2006-01-02 15:04:05"),
		})
	}

	response.Success(c, gin.H{
		"count":    len(results),
		"codes":    results,
	})
}

func (h *AdminHandler) ListInvitations(c *gin.Context) {
	list, err := repository.ListInvitations()
	if err != nil {
		response.Error(c, "查询失败")
		return
	}
	response.Success(c, gin.H{"invitations": list})
}

type UpdateUserPermReq struct {
	CanEditTMDB bool `json:"can_edit_tmdb"`
}

func (h *AdminHandler) UpdateUserPermission(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, "无效的用户ID")
		return
	}

	var req UpdateUserPermReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	if err := repository.UpdateUser(uint(id), map[string]any{"can_edit_tmdb": req.CanEditTMDB}); err != nil {
		response.Error(c, "更新失败")
		return
	}
	response.Success(c, nil)
}

func (h *AdminHandler) ToggleDisableUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, "无效的用户ID")
		return
	}

	var req struct {
		Disabled bool `json:"disabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误")
		return
	}

	user, err := repository.GetUserByID(uint(id))
	if err != nil {
		response.Error(c, "用户不存在")
		return
	}
	if user.Role == "admin" {
		response.Error(c, "不能禁用管理员账户")
		return
	}

	if err := repository.UpdateUser(uint(id), map[string]any{"disabled": req.Disabled}); err != nil {
		response.Error(c, "操作失败")
		return
	}
	response.Success(c, nil)
}

func (h *AdminHandler) DeleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		response.Error(c, "无效的用户ID")
		return
	}

	user, err := repository.GetUserByID(uint(id))
	if err != nil {
		response.Error(c, "用户不存在")
		return
	}
	if user.Role == "admin" {
		response.Error(c, "不能删除管理员账户")
		return
	}

	if err := repository.DeleteUser(uint(id)); err != nil {
		response.Error(c, "删除失败")
		return
	}
	response.Success(c, nil)
}

func (h *AdminHandler) ListExportLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	list, total, err := repository.ListExportLogs(page, pageSize)
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
