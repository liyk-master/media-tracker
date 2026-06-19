package repository

import (
	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
)

func CreateExportLog(log *model.ExportLog) error {
	return config.Conf.DB.Create(log).Error
}

func ListExportLogs(page, pageSize int) ([]model.ExportLog, int64, error) {
	var list []model.ExportLog
	var total int64

	query := config.Conf.DB.Model(&model.ExportLog{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("id DESC").Offset(offset).Limit(pageSize).Find(&list).Error; err != nil {
		return nil, 0, err
	}
	return list, total, nil
}
