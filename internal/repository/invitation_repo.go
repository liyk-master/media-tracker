package repository

import (
	"time"

	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
)

func CreateInvitation(inv *model.Invitation) error {
	return config.Conf.DB.Create(inv).Error
}

func GetInvitationByCode(code string) (*model.Invitation, error) {
	var inv model.Invitation
	err := config.Conf.DB.Where("code = ?", code).First(&inv).Error
	return &inv, err
}

func UseInvitation(id uint, userID uint) error {
	now := time.Now()
	return config.Conf.DB.Model(&model.Invitation{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"used_by": userID,
			"used_at": now,
		}).Error
}

func ListInvitations() ([]model.Invitation, error) {
	var list []model.Invitation
	err := config.Conf.DB.Order("id DESC").Find(&list).Error
	return list, err
}
