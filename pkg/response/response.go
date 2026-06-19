package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{Code: 0, Message: "ok", Data: data})
}

func Error(c *gin.Context, msg string) {
	c.JSON(http.StatusOK, Response{Code: -1, Message: msg, Data: nil})
}

func Duplicate(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{Code: 0, Message: "duplicate", Data: data})
}

func Unauthorized(c *gin.Context, msg string) {
	if msg == "" {
		msg = "未授权"
	}
	c.AbortWithStatusJSON(http.StatusUnauthorized, Response{Code: -1, Message: msg, Data: nil})
}

func Forbidden(c *gin.Context, msg string) {
	if msg == "" {
		msg = "禁止访问"
	}
	c.AbortWithStatusJSON(http.StatusForbidden, Response{Code: -1, Message: msg, Data: nil})
}
