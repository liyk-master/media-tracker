package model

import "time"

type ExportLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	Username  string    `gorm:"size:50;not null" json:"username"`
	ItemCount int       `gorm:"not null" json:"item_count"`
	Params    string    `gorm:"type:text" json:"params"`
	CreatedAt time.Time `json:"created_at"`
}
