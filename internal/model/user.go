package model

import "time"

type User struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Username  string    `gorm:"size:50;not null;uniqueIndex" json:"username"`
	Password  string    `gorm:"size:255;not null" json:"-"`
	APIKey    string    `gorm:"size:64;not null;uniqueIndex" json:"api_key"`
	Role        string    `gorm:"size:10;not null;default:'user'" json:"role"`
	CanEditTMDB bool      `gorm:"default:false" json:"can_edit_tmdb"`
	Disabled    bool      `gorm:"default:false" json:"disabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
