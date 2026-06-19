package repository

import (
	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
)

func CreateUser(user *model.User) error {
	return config.Conf.DB.Create(user).Error
}

func GetUserByUsername(username string) (*model.User, error) {
	var user model.User
	err := config.Conf.DB.Where("username = ?", username).First(&user).Error
	return &user, err
}

func GetUserByID(id uint) (*model.User, error) {
	var user model.User
	err := config.Conf.DB.First(&user, id).Error
	return &user, err
}

func GetUserByAPIKey(apiKey string) (*model.User, error) {
	var user model.User
	err := config.Conf.DB.Where("api_key = ?", apiKey).First(&user).Error
	return &user, err
}

func CountUsers() (int64, error) {
	var count int64
	err := config.Conf.DB.Model(&model.User{}).Count(&count).Error
	return count, err
}

func ListUsers() ([]model.User, error) {
	var users []model.User
	err := config.Conf.DB.Order("id ASC").Find(&users).Error
	return users, err
}

func UpdateUser(id uint, updates map[string]any) error {
	return config.Conf.DB.Model(&model.User{}).Where("id = ?", id).Updates(updates).Error
}

func DeleteUser(id uint) error {
	return config.Conf.DB.Delete(&model.User{}, id).Error
}
