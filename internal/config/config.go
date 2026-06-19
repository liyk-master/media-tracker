package config

import (
	"time"

	"gorm.io/gorm"
)

var Conf = &Config{}

type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	DBName   string `yaml:"dbname"`
}

func (d *DatabaseConfig) DSN() string {
	return d.User + ":" + d.Password + "@tcp(" + d.Host + ":" + itoa(d.Port) + ")/" + d.DBName + "?charset=utf8mb4&parseTime=True&loc=Local"
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var r []byte
	for i > 0 {
		r = append([]byte{byte('0' + i%10)}, r...)
		i /= 10
	}
	return string(r)
}

type JWTConfig struct {
	Secret      string `yaml:"secret"`
	ExpireHours int    `yaml:"expire_hours"`
}

func (j *JWTConfig) ExpireDuration() time.Duration {
	return time.Duration(j.ExpireHours) * time.Hour
}

type IdentifierConfig struct {
	APIURL         string `yaml:"api_url"`
	AuthURL        string `yaml:"auth_url"`
	Username       string `yaml:"username"`
	Password       string `yaml:"password"`
	TimeoutSeconds int    `yaml:"timeout_seconds"`
	Concurrency    int    `yaml:"concurrency"`
}

type WSConfig struct {
	MaxConnections int `yaml:"max_connections"`
}

type InvitationConfig struct {
	Required bool `yaml:"required"`
}

type TMDBConfig struct {
	APIKey     string `yaml:"api_key"`
	ProxyURL   string `yaml:"proxy_url"`
	PosterBase string `yaml:"poster_base"`
}

type Config struct {
	Database   DatabaseConfig   `yaml:"database"`
	JWT        JWTConfig        `yaml:"jwt"`
	Identifier IdentifierConfig `yaml:"identifier"`
	WS         WSConfig         `yaml:"ws"`
	Invitation InvitationConfig `yaml:"invitation"`
	TMDB       TMDBConfig       `yaml:"tmdb"`
	Server     struct {
		Port int    `yaml:"port"`
		Mode string `yaml:"mode"`
	} `yaml:"server"`
	DB *gorm.DB
}
