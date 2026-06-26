package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

type JSON json.RawMessage

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSON) Scan(value interface{}) error {
	if value == nil {
		*j = JSON("null")
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = make([]byte, len(v))
		copy(bytes, v)
	case string:
		bytes = []byte(v)
	default:
		return errors.New("invalid type for JSON")
	}
	*j = JSON(bytes)
	return nil
}

func (j JSON) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	if json.Valid(j) {
		return json.RawMessage(j).MarshalJSON()
	}
	return []byte("null"), nil
}

func (j *JSON) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("JSON: UnmarshalJSON on nil pointer")
	}
	*j = append((*j)[0:0], data...)
	return nil
}

type Media struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Sha256    string    `gorm:"type:char(64);not null;uniqueIndex" json:"sha256"`
	FileName  string    `gorm:"size:500;not null" json:"file_name"`
	FileSize  int64     `gorm:"not null" json:"file_size"`
	CloudType string    `gorm:"size:50;default:''" json:"cloud_type"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	TMDBID    int       `gorm:"default:0;index" json:"tmdb_id"`
	MediaType string    `gorm:"size:10;default:''" json:"media_type"`
	JsonData  JSON      `gorm:"type:json" json:"json_data"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MediaWithUser struct {
	ID        uint      `json:"id"`
	Sha256    string    `json:"sha256"`
	FileName  string    `json:"file_name"`
	FileSize  int64     `json:"file_size"`
	CloudType string    `json:"cloud_type"`
	UserID    uint      `json:"user_id"`
	TMDBID    int       `json:"tmdb_id"`
	MediaType string    `json:"media_type"`
	JsonData  JSON      `json:"json_data"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Username  string    `json:"username"`
}

type LeaderboardItem struct {
	Username   string `json:"username"`
	TotalSize  int64  `json:"total_size"`
	TotalCount int64  `json:"total_count"`
}
