package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/pkg/response"
)

func AuthOr() gin.HandlerFunc {
	return func(c *gin.Context) {
		hasToken := c.GetHeader("Authorization") != ""
		hasAPIKey := c.GetHeader("X-API-Key") != ""

		if !hasToken && !hasAPIKey {
			response.Unauthorized(c, "请提供 JWT Token 或 API Key")
			return
		}

		if hasToken {
			JWTAuth()(c)
			return
		}

		APIKeyAuth()(c)
	}
}

func AuthOrSkippable() gin.HandlerFunc {
	return func(c *gin.Context) {
		hasToken := c.GetHeader("Authorization") != ""
		hasAPIKey := c.GetHeader("X-API-Key") != ""

		if !hasToken && !hasAPIKey {
			c.Next()
			return
		}

		if hasToken {
			JWTAuth()(c)
			return
		}

		APIKeyAuth()(c)
	}
}
