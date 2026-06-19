package model

import "time"

type Invitation struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Code      string     `gorm:"size:32;not null;uniqueIndex" json:"code"`
	CreatedBy uint       `gorm:"not null" json:"created_by"`
	ExpiresAt time.Time  `json:"expires_at"`
	UsedBy    *uint      `json:"used_by,omitempty"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}
