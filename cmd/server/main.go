package main

import (
	"embed"
	"fmt"
	"io/fs"
	"io/ioutil"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/handler"
	"github.com/liyk-master/media-tracker/internal/middleware"
	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/service"
	"github.com/liyk-master/media-tracker/internal/ws"
	"gopkg.in/yaml.v2"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

//go:embed web/dist
var webFS embed.FS

func main() {
	yamlFile, err := ioutil.ReadFile("config.yaml")
	if err != nil {
		panic(fmt.Sprintf("读取配置文件失败: %v", err))
	}
	if err := yaml.Unmarshal(yamlFile, config.Conf); err != nil {
		panic(fmt.Sprintf("解析配置文件失败: %v", err))
	}

	dsn := config.Conf.Database.DSN()
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
		},
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger:                                   logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		panic(fmt.Sprintf("数据库连接失败: %v", err))
	}

	db.Set("gorm:table_options", "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
	sqlDB, err := db.DB()
	if err != nil {
		panic(fmt.Sprintf("获取数据库对象失败: %v", err))
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)
	sqlDB.SetConnMaxIdleTime(time.Minute)

	if err := sqlDB.Ping(); err != nil {
		panic(fmt.Sprintf("数据库连接 ping 失败: %v", err))
	}
	config.Conf.DB = db

	if err := model.InitDB(); err != nil {
		panic(fmt.Sprintf("数据库初始化失败: %v", err))
	}
	fmt.Println("数据库初始化成功")

	hub := ws.NewHub()

	identifierService := service.NewIdentifierService()
	uploadService := service.NewUploadService(identifierService, hub)

	concurrency := config.Conf.Identifier.Concurrency
	if concurrency <= 0 {
		concurrency = 5
	}
	uploadService.StartWorkers(concurrency)

	authHandler := handler.NewAuthHandler()
	uploadHandler := handler.NewUploadHandler(uploadService)
	mediaHandler := handler.NewMediaHandler()
	userHandler := handler.NewUserHandler()
	adminHandler := handler.NewAdminHandler()
	tmdbHandler := handler.NewTMDBHandler()
	manualHandler := handler.NewManualHandler(identifierService)

	r := gin.Default()
	r.SetTrustedProxies(nil)

	subFS, _ := fs.Sub(webFS, "web/dist")

	r.GET("/ws", func(c *gin.Context) {
		hub.HandleWS(c.Writer, c.Request)
	})

	api := r.Group("/api")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		protected := api.Group("")
		protected.Use(middleware.AuthOr())
		{
			protected.POST("/upload", uploadHandler.Upload)
			protected.POST("/upload/batch", uploadHandler.UploadBatch)
			protected.POST("/upload/file", uploadHandler.UploadFile)
			protected.GET("/media", mediaHandler.List)
			protected.GET("/media/export", mediaHandler.Export)
			protected.PUT("/media/:id/tmdb", middleware.CanEditTMDB(), uploadHandler.UpdateTMDB)
			protected.POST("/manual/validate", manualHandler.Validate)
			protected.GET("/media/:id", mediaHandler.GetByID)
		protected.GET("/user/apikey", userHandler.GetAPIKey)
		protected.GET("/user/profile", userHandler.GetProfile)
		protected.GET("/user/stats", userHandler.GetStats)
		protected.POST("/user/apikey/reset", userHandler.ResetAPIKey)
		}

		api.GET("/tmdb/poster/:type/:id", tmdbHandler.Poster)


		admin := api.Group("/admin")
		admin.Use(middleware.AuthOr(), middleware.AdminOnly())
		{
			admin.GET("/users", adminHandler.ListUsers)
			admin.PATCH("/users/:id", adminHandler.UpdateUserPermission)
			admin.POST("/invitations", adminHandler.CreateInvitation)
			admin.GET("/invitations", adminHandler.ListInvitations)
			admin.GET("/export-logs", adminHandler.ListExportLogs)
			admin.PATCH("/users/:id/status", adminHandler.ToggleDisableUser)
			admin.DELETE("/users/:id", adminHandler.DeleteUser)
		}
	}

	r.NoRoute(func(c *gin.Context) {
		path := strings.TrimPrefix(c.Request.URL.Path, "/")
		if path == "" {
			path = "."
		}
		f, err := subFS.Open(path)
		if err == nil {
			f.Close()
			c.FileFromFS(c.Request.URL.Path, http.FS(subFS))
			return
		}
		c.FileFromFS("/", http.FS(subFS))
	})

	addr := fmt.Sprintf(":%d", config.Conf.Server.Port)
	fmt.Printf("服务启动: http://127.0.0.1%s\n", addr)
	if err := r.Run(addr); err != nil {
		panic(fmt.Sprintf("服务启动失败: %v", err))
	}
}
