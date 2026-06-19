package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/service"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type AuthHandler struct {
}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

type RegisterReq struct {
	Username   string `json:"username" binding:"required,min=2,max=50"`
	Password   string `json:"password" binding:"required,min=6,max=100"`
	InviteCode string `json:"invite_code"`
}

type LoginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	user, err := service.Register(req.Username, req.Password, req.InviteCode)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, gin.H{
		"user_id":  user.ID,
		"username": user.Username,
		"api_key":  user.APIKey,
		"role":     user.Role,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, "参数错误: "+err.Error())
		return
	}

	token, user, err := service.Login(req.Username, req.Password)
	if err != nil {
		response.Error(c, err.Error())
		return
	}

	response.Success(c, gin.H{
		"token":    token,
		"user_id":  user.ID,
		"username": user.Username,
		"role":     user.Role,
	})
}
