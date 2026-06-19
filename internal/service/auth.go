package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"

	"golang.org/x/crypto/bcrypt"

	"time"

	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/jwt"
)

func Register(username, password, inviteCode string) (*model.User, error) {
	existing, _ := repository.GetUserByUsername(username)
	if existing != nil && existing.ID > 0 {
		return nil, errors.New("用户名已存在")
	}

	count, _ := repository.CountUsers()
	isFirst := count == 0

	if !isFirst && config.Conf.Invitation.Required {
		if inviteCode == "" {
			return nil, errors.New("需要邀请码")
		}
		inv, err := repository.GetInvitationByCode(inviteCode)
		if err != nil {
			return nil, errors.New("无效邀请码")
		}
		if inv.UsedBy != nil {
			return nil, errors.New("邀请码已使用")
		}
		if inv.ExpiresAt.Before(time.Now()) {
			return nil, errors.New("邀请码已过期")
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	role := "user"
	if isFirst {
		role = "admin"
	}

	user := &model.User{
		Username: username,
		Password: string(hash),
		APIKey:   GenerateAPIKey(),
		Role:     role,
	}

	if err := repository.CreateUser(user); err != nil {
		return nil, err
	}

	if !isFirst && config.Conf.Invitation.Required && inviteCode != "" {
		if inv, err := repository.GetInvitationByCode(inviteCode); err == nil && inv.UsedBy == nil {
			repository.UseInvitation(inv.ID, user.ID)
		}
	}

	return user, nil
}

func Login(username, password string) (string, *model.User, error) {
	user, err := repository.GetUserByUsername(username)
	if err != nil {
		return "", nil, errors.New("用户名或密码错误")
	}

	if user.Disabled {
		return "", nil, errors.New("账户已被禁用")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", nil, errors.New("用户名或密码错误")
	}

	token, err := jwt.GenerateToken(user.ID, user.Role)
	if err != nil {
		return "", nil, err
	}

	return token, user, nil
}

func GenerateAPIKey() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
