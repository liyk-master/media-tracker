package repository

import (
	"fmt"
	"strings"

	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/internal/model"
	"gorm.io/gorm"
)

func GetMediaBySha256(sha256 string) (*model.Media, error) {
	var m model.Media
	result := config.Conf.DB.Where("sha256 = ?", sha256).Limit(1).Find(&m)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &m, nil
}

func CreateMedia(m *model.Media) error {
	err := config.Conf.DB.Create(m).Error
	if err != nil && strings.Contains(err.Error(), "Duplicate entry") {
		return fmt.Errorf("sha256 already exists")
	}
	return err
}

func buildQuery(q, mediaType string, tmdbID int, year int) *gorm.DB {
	query := config.Conf.DB.Model(&model.Media{})
	if q != "" {
		query = query.Where("file_name LIKE ?", "%"+q+"%")
	}
	if mediaType != "" {
		query = query.Where("media_type = ?", mediaType)
	}
	if tmdbID > 0 {
		query = query.Where("tmdb_id = ?", tmdbID)
	}
	if year > 0 {
		query = query.Where("JSON_EXTRACT(json_data, '$.year') = ?", year)
	}
	return query
}

func ListMedia(page, pageSize int, q, mediaType string, tmdbID int, year int) ([]model.Media, int64, error) {
	var list []model.Media
	var total int64
	query := buildQuery(q, mediaType, tmdbID, year)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	offset := (page - 1) * pageSize
	if err := query.Order("id DESC").Offset(offset).Limit(pageSize).Find(&list).Error; err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func ListMediaByIDs(ids []uint) ([]model.Media, error) {
	var list []model.Media
	query := config.Conf.DB.Model(&model.Media{}).Where("id IN ?", ids)
	if err := query.Order("id DESC").Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

func GetMediaByID(id uint) (*model.Media, error) {
	var m model.Media
	result := config.Conf.DB.Where("id = ?", id).Limit(1).Find(&m)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &m, nil
}

func ListMediaByTmdbIDs(tmdbIDs []int) ([]model.Media, error) {
	var list []model.Media
	if err := config.Conf.DB.Model(&model.Media{}).Where("tmdb_id IN ?", tmdbIDs).Order("id DESC").Find(&list).Error; err != nil {
		return nil, err
	}
	return list, nil
}

func CountMediaByTmdbID(tmdbID int) (int64, error) {
	var count int64
	if err := config.Conf.DB.Model(&model.Media{}).Where("tmdb_id = ?", tmdbID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func UpdateMedia(id uint, updates map[string]interface{}) error {
	return config.Conf.DB.Model(&model.Media{}).Where("id = ?", id).Updates(updates).Error
}

type MediaGroupRow struct {
	model.Media
	Count     int   `json:"count"`
	TotalSize int64 `json:"total_size"`
}

func ListMediaGrouped(page, pageSize int, q, mediaType string, year int, tmdbID int) ([]MediaGroupRow, int64, error) {
	db := config.Conf.DB

	conds := []string{"tmdb_id > 0"}
	args := []interface{}{}

	if q != "" {
		conds = append(conds, "file_name LIKE ?")
		args = append(args, "%"+q+"%")
	}
	if mediaType != "" {
		conds = append(conds, "media_type = ?")
		args = append(args, mediaType)
	}
	if year > 0 {
		conds = append(conds, "JSON_EXTRACT(json_data, '$.year') = ?")
		args = append(args, year)
	}
	if tmdbID > 0 {
		conds = append(conds, "tmdb_id = ?")
		args = append(args, tmdbID)
	}

	where := strings.Join(conds, " AND ")

	var total int64
	if err := db.Raw("SELECT COUNT(DISTINCT tmdb_id) FROM media WHERE "+where, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}

	type groupInfo struct {
		MaxID     uint  `gorm:"column:max_id"`
		Cnt       int   `gorm:"column:cnt"`
		TotalSize int64 `gorm:"column:total_size"`
	}
	offset := (page - 1) * pageSize
	groupSQL := "SELECT MAX(id) as max_id, COUNT(*) as cnt, SUM(file_size) as total_size FROM media WHERE " + where + " GROUP BY tmdb_id ORDER BY max_id DESC LIMIT ? OFFSET ?"
	groupArgs := append(args, pageSize, offset)
	var groups []groupInfo
	if err := db.Raw(groupSQL, groupArgs...).Scan(&groups).Error; err != nil {
		return nil, 0, err
	}

	ids := make([]uint, len(groups))
	countMap := make(map[uint]int)
	sizeMap := make(map[uint]int64)
	for i, g := range groups {
		ids[i] = g.MaxID
		countMap[g.MaxID] = g.Cnt
		sizeMap[g.MaxID] = g.TotalSize
	}

	var items []model.Media
	if len(ids) > 0 {
		if err := db.Where("id IN ?", ids).Find(&items).Error; err != nil {
			return nil, 0, err
		}
	}

	itemMap := make(map[uint]model.Media)
	for _, item := range items {
		itemMap[item.ID] = item
	}

	result := make([]MediaGroupRow, len(groups))
	for i, g := range groups {
		item, ok := itemMap[g.MaxID]
		if !ok {
			continue
		}
		result[i] = MediaGroupRow{Media: item, Count: g.Cnt, TotalSize: g.TotalSize}
	}

	return result, total, nil
}

type UserMediaStats struct {
	TotalFiles int64
	TotalShows int64
	TotalSize  int64
	ByType     map[string]int64
}

func GetUserMediaStats(userID uint) (*UserMediaStats, error) {
	db := config.Conf.DB.Model(&model.Media{}).Where("user_id = ?", userID)

	var totalFiles int64
	if err := db.Count(&totalFiles).Error; err != nil {
		return nil, err
	}

	var totalShows int64
	if err := config.Conf.DB.Model(&model.Media{}).
		Where("user_id = ? AND tmdb_id > 0", userID).
		Distinct("tmdb_id").
		Count(&totalShows).Error; err != nil {
		return nil, err
	}

	var totalSize int64
	if err := config.Conf.DB.Model(&model.Media{}).
		Where("user_id = ?", userID).
		Select("COALESCE(SUM(file_size), 0)").
		Scan(&totalSize).Error; err != nil {
		return nil, err
	}

	type typeCount struct {
		MediaType string `gorm:"column:media_type"`
		Cnt       int64  `gorm:"column:cnt"`
	}
	var typeCounts []typeCount
	if err := config.Conf.DB.Model(&model.Media{}).
		Select("media_type, COUNT(*) as cnt").
		Where("user_id = ?", userID).
		Group("media_type").
		Find(&typeCounts).Error; err != nil {
		return nil, err
	}

	byType := make(map[string]int64)
	for _, tc := range typeCounts {
		byType[tc.MediaType] = tc.Cnt
	}

	return &UserMediaStats{
		TotalFiles: totalFiles,
		TotalShows: totalShows,
		TotalSize:  totalSize,
		ByType:     byType,
	}, nil
}

func ListAllMedia(q, mediaType string, tmdbID int, limit int, year int) ([]model.Media, error) {
	var list []model.Media
	query := buildQuery(q, mediaType, tmdbID, year)
	if limit <= 0 {
		limit = 10000
	}
	if err := query.Order("id DESC").Limit(limit).Find(&list).Error; err != nil {
		return nil, fmt.Errorf("查询导出数据失败: %w", err)
	}
	return list, nil
}
