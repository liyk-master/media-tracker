package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/response"
)

func APIKeyAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			response.Unauthorized(c, "未提供 API Key")
			return
		}

		user, err := repository.GetUserByAPIKey(apiKey)
		if err != nil {
			response.Unauthorized(c, "无效 API Key")
			return
		}

		if user.Disabled {
			response.Forbidden(c, "账户已被禁用")
			return
		}

		c.Set("userID", user.ID)
		c.Next()
	}
}
