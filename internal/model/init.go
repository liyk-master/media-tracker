package model

import (
	"github.com/liyk-master/media-tracker/internal/config"
)

func InitDB() error {
	return config.Conf.DB.AutoMigrate(&User{}, &Media{}, &Invitation{}, &ExportLog{})
}
