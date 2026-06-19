package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/response"
)

func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role != "admin" {
			response.Forbidden(c, "需要管理员权限")
			return
		}
		c.Next()
	}
}

func CanEditTMDB() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get("role")
		if role == "admin" {
			c.Next()
			return
		}
		userID := c.GetUint("userID")
		user, err := repository.GetUserByID(userID)
		if err == nil && user.CanEditTMDB {
			c.Next()
			return
		}
		response.Forbidden(c, "无权限")
		c.Abort()
	}
}
