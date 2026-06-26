package service

import (
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/liyk-master/media-tracker/internal/model"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/internal/ws"
)

var videoExts = map[string]bool{
	".mp4": true, ".mkv": true, ".avi": true, ".mov": true, ".wmv": true,
	".flv": true, ".webm": true, ".mpg": true, ".mpeg": true, ".m4v": true,
	".rm": true, ".rmvb": true, ".ts": true, ".3gp": true, ".vob": true,
	".m2ts": true, ".iso": true,
}

func isVideoFile(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return videoExts[ext]
}

func isValidSha256(hash string) bool {
	return len(hash) == 64
}

func safeSha256Prefix(hash string, n int) string {
	if len(hash) < n {
		return hash
	}
	return hash[:n]
}

type UploadRequest struct {
	Sha256 string `json:"sha256" binding:"required"`
	Size   int64  `json:"size" binding:"required"`
	Name   string `json:"name" binding:"required"`
	Cloud  string `json:"cloud"`
}

type UploadResult struct {
	ID         uint       `json:"id"`
	Sha256     string     `json:"sha256"`
	TMDBID     int        `json:"tmdb_id"`
	Title      string     `json:"title"`
	CleanName  string     `json:"clean_name"`
	MediaType  string     `json:"media_type"`
	Duplicate  bool       `json:"duplicate"`
	JsonData   model.JSON `json:"-"`
}

type SubmitResult struct {
	BatchID string `json:"batch_id"`
	Total   int    `json:"total"`
	Skipped int    `json:"skipped"`
}

type jobItem struct {
	BatchID  string
	UserID   uint
	Username string
	Request  *UploadRequest
}

type batchState struct {
	Total      int
	Success    int32
	Failed     int32
	Duplicates int32
	Done       int32
}

var batchIDCounter int64

func nextBatchID() string {
	id := atomic.AddInt64(&batchIDCounter, 1)
	return fmt.Sprintf("%08x", id)
}

type UploadService struct {
	identifier *IdentifierService
	hub        *ws.Hub
	jobQueue   chan *jobItem
	batches    sync.Map
}

func NewUploadService(identifier *IdentifierService, hub *ws.Hub) *UploadService {
	return &UploadService{
		identifier: identifier,
		hub:        hub,
		jobQueue:   make(chan *jobItem, 2000),
	}
}

func (s *UploadService) StartWorkers(n int) {
	for range n {
		go s.worker()
	}
	log.Printf("[worker] 启动 %d 个异步处理 worker", n)
}

func (s *UploadService) worker() {
	for job := range s.jobQueue {
		s.processJob(job)
	}
}

func (s *UploadService) processJob(job *jobItem) {
	start := time.Now()
	log.Printf("[job] 开始处理 batch=%s user=%s file=%s", job.BatchID[:8], job.Username, job.Request.Name)

	if !isValidSha256(job.Request.Sha256) {
		val, _ := s.batches.Load(job.BatchID)
		bs := val.(*batchState)
		atomic.AddInt32(&bs.Failed, 1)
		log.Printf("[job] batch=%s sha256无效 (len=%d): %s", job.BatchID[:8], len(job.Request.Sha256), job.Request.Name)
		s.hub.Broadcast(ws.Message{
			Type: "upload_error",
			Payload: map[string]any{
				"batch_id":  job.BatchID,
				"username":  job.Username,
				"sha256":    job.Request.Sha256,
				"file_name": job.Request.Name,
				"file_size": job.Request.Size,
				"cloud":     job.Request.Cloud,
				"error":     fmt.Sprintf("sha256 长度异常 (%d)，可能为 MD5 而非 SHA256", len(job.Request.Sha256)),
			},
		})
		s.finishJob(job)
		return
	}

	result, err := s.Upload(job.UserID, job.Request)

	val, _ := s.batches.Load(job.BatchID)
	bs := val.(*batchState)

	if err != nil {
		atomic.AddInt32(&bs.Failed, 1)
		log.Printf("[job] batch=%s 失败 (%v) file=%s: %v", job.BatchID[:8], time.Since(start), job.Request.Name, err)
		s.hub.Broadcast(ws.Message{
			Type: "upload_error",
			Payload: map[string]any{
				"batch_id":  job.BatchID,
				"username":  job.Username,
				"sha256":    job.Request.Sha256,
				"file_name": job.Request.Name,
				"file_size": job.Request.Size,
				"cloud":     job.Request.Cloud,
				"error":     err.Error(),
			},
		})
	} else if result.Duplicate {
		atomic.AddInt32(&bs.Duplicates, 1)
		s.hub.SendToUser(job.UserID, ws.Message{
			Type: "upload_duplicate",
			Payload: map[string]any{
				"batch_id": job.BatchID,
				"username": job.Username,
				"sha256":   result.Sha256,
				"tmdb_id":  result.TMDBID,
				"title":    result.Title,
			},
		})
	} else {
		atomic.AddInt32(&bs.Success, 1)
		log.Printf("[job] batch=%s 完成 (%v) file=%s", job.BatchID[:8], time.Since(start), job.Request.Name)
		cleanName := result.CleanName
		if cleanName == "" {
			cleanName = result.Title
		}
		if cleanName == "" {
			cleanName = job.Request.Name
		}

		showName := extractShowName(result.JsonData)
		suggestedPath := extractSuggestedPath(result.JsonData)

		payload := map[string]any{
			"id":             result.ID,
			"sha256":         result.Sha256,
			"tmdb_id":        result.TMDBID,
			"title":          cleanName,
			"show_name":      showName,
			"media_type":     result.MediaType,
			"file_name":      job.Request.Name,
			"file_size":      job.Request.Size,
			"username":       job.Username,
			"suggested_path": suggestedPath,
		}
		if result.TMDBID > 0 {
			payload["year"] = extractYear(result.JsonData)
			mediaCount, _ := repository.CountMediaByTmdbID(result.TMDBID)
			payload["count"] = mediaCount
		}
		s.hub.Broadcast(ws.Message{
			Type:    "new_media",
			Payload: payload,
		})
	}

	s.finishJob(job)
}

func (s *UploadService) finishJob(job *jobItem) {
	val, _ := s.batches.Load(job.BatchID)
	bs := val.(*batchState)

	done := atomic.AddInt32(&bs.Done, 1)
	total := int32(bs.Total)

	s.hub.SendToUser(job.UserID, ws.Message{
		Type: "upload_progress",
		Payload: map[string]any{
			"batch_id":   job.BatchID,
			"username":   job.Username,
			"total":      total,
			"done":       done,
			"success":    atomic.LoadInt32(&bs.Success),
			"failed":     atomic.LoadInt32(&bs.Failed),
			"duplicates": atomic.LoadInt32(&bs.Duplicates),
		},
	})

	if done == total {
		log.Printf("[batch] batch=%s 全部完成: %d 成功, %d 失败, %d 重复",
			job.BatchID[:8], bs.Success, bs.Failed, bs.Duplicates)
		s.batches.Delete(job.BatchID)
		s.hub.SendToUser(job.UserID, ws.Message{
			Type: "upload_batch_done",
			Payload: map[string]any{
				"batch_id":   job.BatchID,
				"username":   job.Username,
				"total":      total,
				"success":    atomic.LoadInt32(&bs.Success),
				"failed":     atomic.LoadInt32(&bs.Failed),
				"duplicates": atomic.LoadInt32(&bs.Duplicates),
			},
		})
	}
}

func (s *UploadService) Submit(userID uint, req *UploadRequest) (*SubmitResult, error) {
	if !isValidSha256(req.Sha256) {
		return nil, fmt.Errorf("sha256 长度异常 (%d)，可能为 MD5 而非 SHA256: %s", len(req.Sha256), req.Name)
	}
	if !isVideoFile(req.Name) {
		return nil, fmt.Errorf("非视频文件，已跳过: %s", req.Name)
	}

	batchID := nextBatchID()
	username := s.fetchUsername(userID)
	s.batches.Store(batchID, &batchState{Total: 1})
	s.jobQueue <- &jobItem{BatchID: batchID, UserID: userID, Username: username, Request: req}
	log.Printf("[submit] 单条 batch=%s file=%s", batchID[:8], req.Name)
	return &SubmitResult{BatchID: batchID, Total: 1}, nil
}

func (s *UploadService) SubmitBatch(userID uint, reqs []UploadRequest) *SubmitResult {
	var valid []UploadRequest
	skipped := 0
	for i := range reqs {
		r := reqs[i]
		if !isValidSha256(r.Sha256) {
			skipped++
			log.Printf("[filter] 跳过(sha256无效): name=%s sha256_len=%d", r.Name, len(r.Sha256))
			continue
		}
		if !isVideoFile(r.Name) {
			skipped++
			log.Printf("[filter] 跳过(非视频): name=%s", r.Name)
			continue
		}
		valid = append(valid, r)
	}

	if len(valid) == 0 {
		log.Printf("[submit] 批量提交全部被过滤: total=%d skipped=%d", len(reqs), skipped)
		return &SubmitResult{BatchID: "", Total: 0, Skipped: skipped}
	}

	batchID := nextBatchID()
	username := s.fetchUsername(userID)
	bs := &batchState{Total: len(valid)}
	s.batches.Store(batchID, bs)

	for i := range valid {
		r := valid[i]
		s.jobQueue <- &jobItem{BatchID: batchID, UserID: userID, Username: username, Request: &r}
	}

	log.Printf("[submit] 批量 batch=%s total=%d skipped=%d", batchID[:8], len(valid), skipped)
	return &SubmitResult{BatchID: batchID, Total: len(valid), Skipped: skipped}
}

func (s *UploadService) fetchUsername(userID uint) string {
	user, err := repository.GetUserByID(userID)
	if err != nil || user == nil {
		return "未知用户"
	}
	return user.Username
}

func (s *UploadService) Upload(userID uint, req *UploadRequest) (*UploadResult, error) {
	existing, err := repository.GetMediaBySha256(req.Sha256)
	if err == nil && existing != nil {
		title := extractTitle(existing.JsonData)
		cleanName := extractCleanName(existing.JsonData, existing.FileName)
		return &UploadResult{
			ID:        existing.ID,
			Sha256:    existing.Sha256,
			TMDBID:    existing.TMDBID,
			Title:     title,
			CleanName: cleanName,
			MediaType: existing.MediaType,
			Duplicate: true,
			JsonData:  existing.JsonData,
		}, nil
	}

	result, err := s.identifier.Identify(req.Name, "")
	if err != nil {
		return nil, err
	}

	if !result.TmdbMatched && (result.MediaType == "tv" || result.MediaType == "movie") {
		return nil, fmt.Errorf("识别失败: 未匹配到 TMDB 条目 (media_type=%s)", result.MediaType)
	}

	var jsonData model.JSON
	if result.TmdbInfo != nil {
		raw, _ := json.Marshal(result)
		jsonData = model.JSON(raw)
	}

	media := &model.Media{
		Sha256:    req.Sha256,
		FileName:  req.Name,
		FileSize:  req.Size,
		CloudType: req.Cloud,
		UserID:    userID,
		TMDBID:    0,
		MediaType: result.MediaType,
		JsonData:  jsonData,
	}

	if result.TmdbMatched {
		switch v := result.TmdbInfo["id"].(type) {
		case float64:
			media.TMDBID = int(v)
		case string:
			if id, err := strconv.Atoi(v); err == nil {
				media.TMDBID = id
			}
		}
	}

	if err := repository.CreateMedia(media); err != nil {
		if strings.Contains(err.Error(), "sha256 already exists") {
			existing, _ := repository.GetMediaBySha256(req.Sha256)
			if existing != nil {
				title := extractTitle(existing.JsonData)
				cleanName := extractCleanName(existing.JsonData, existing.FileName)
				return &UploadResult{
					ID:        existing.ID,
					Sha256:    existing.Sha256,
					TMDBID:    existing.TMDBID,
					Title:     title,
					CleanName: cleanName,
					MediaType: existing.MediaType,
					Duplicate: true,
					JsonData:  existing.JsonData,
				}, nil
			}
		}
		return nil, err
	}

	title := extractTitle(jsonData)
	cleanName := result.SuggestedName

	return &UploadResult{
		ID:        media.ID,
		Sha256:    media.Sha256,
		TMDBID:    media.TMDBID,
		Title:     title,
		CleanName: cleanName,
		MediaType: media.MediaType,
		Duplicate: false,
		JsonData:  jsonData,
	}, nil
}

type reidentifyResult struct {
	jsonData      model.JSON
	mediaType     string
	suggestedPath string
}

func (s *UploadService) reidentifyMedia(media *model.MediaWithUser, newTmdbID int, mediaType string) (*reidentifyResult, error) {
	var season, episode int
	if len(media.JsonData) > 0 {
		var jd map[string]any
		json.Unmarshal([]byte(media.JsonData), &jd)
		if s, ok := jd["season"].(float64); ok {
			season = int(s)
		}
		if e, ok := jd["episode"].(float64); ok {
			episode = int(e)
		}
	}

	fakeName := fmt.Sprintf("manual_{tmdbid=%d}_{%s}.mp4", newTmdbID, mediaType)
	if season > 0 && episode > 0 {
		fakeName = fmt.Sprintf("manual_S%02dE%02d_{tmdbid=%d}_{%s}.mp4",
			season, episode, newTmdbID, mediaType)
	}
	result, err := s.identifier.Identify(fakeName, mediaType)
	if err != nil {
		return nil, fmt.Errorf("重新识别失败: %w", err)
	}

	var jsonDataMap map[string]any
	if len(media.JsonData) > 0 {
		json.Unmarshal([]byte(media.JsonData), &jsonDataMap)
	}
	if jsonDataMap == nil {
		jsonDataMap = make(map[string]any)
	}

	if result.TmdbInfo != nil {
		jsonDataMap["tmdb_info"] = result.TmdbInfo
		jsonDataMap["tmdb_matched"] = result.TmdbMatched
		jsonDataMap["success"] = true
		jsonDataMap["confidence"] = 1.0

		if title, ok := result.TmdbInfo["title"].(string); ok && title != "" {
			jsonDataMap["title"] = title
		} else if name, ok := result.TmdbInfo["name"].(string); ok && name != "" {
			jsonDataMap["title"] = name
		}

		if result.Year > 0 {
			jsonDataMap["year"] = result.Year
		} else if y, ok := result.TmdbInfo["year"].(float64); ok && y > 0 {
			jsonDataMap["year"] = int(y)
		} else if yStr, ok := result.TmdbInfo["year"].(string); ok && yStr != "" {
			if y, err := strconv.Atoi(yStr); err == nil {
				jsonDataMap["year"] = y
			}
		} else if releaseDate, ok := result.TmdbInfo["release_date"].(string); ok && releaseDate != "" {
			if parts := strings.SplitN(releaseDate, "-", 2); len(parts) > 0 {
				if y, err := strconv.Atoi(parts[0]); err == nil {
					jsonDataMap["year"] = y
				}
			}
		} else if firstAirDate, ok := result.TmdbInfo["first_air_date"].(string); ok && firstAirDate != "" {
			if parts := strings.SplitN(firstAirDate, "-", 2); len(parts) > 0 {
				if y, err := strconv.Atoi(parts[0]); err == nil {
					jsonDataMap["year"] = y
				}
			}
		}

		if title, ok := jsonDataMap["title"].(string); ok && title != "" {
			if year, ok := jsonDataMap["year"].(int); ok && year > 0 {
				jsonDataMap["suggested_name"] = fmt.Sprintf("%s (%d).mp4", title, year)
			} else {
				jsonDataMap["suggested_name"] = fmt.Sprintf("%s.mp4", title)
			}
		}

		if result.SuggestedPath != "" {
			jsonDataMap["suggested_path"] = result.SuggestedPath
		}
	}

	raw, _ := json.Marshal(jsonDataMap)
	jsonData := model.JSON(raw)

	newMediaType := media.MediaType
	switch {
	case mediaType != "":
		newMediaType = mediaType
	case result.MediaType != "":
		newMediaType = result.MediaType
	}

	return &reidentifyResult{
		jsonData:      jsonData,
		mediaType:     newMediaType,
		suggestedPath: result.SuggestedPath,
	}, nil
}

func (s *UploadService) UpdateTMDBID(mediaID uint, newTmdbID int, mediaType string, oldTmdbID int) (*model.MediaWithUser, error) {
	media, err := repository.GetMediaByID(mediaID)
	if err != nil {
		return nil, fmt.Errorf("查询媒体记录失败: %w", err)
	}
	if media == nil {
		return nil, fmt.Errorf("媒体记录不存在")
	}

	identResult, err := s.reidentifyMedia(media, newTmdbID, mediaType)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"tmdb_id":    newTmdbID,
		"media_type": identResult.mediaType,
		"json_data":  identResult.jsonData,
	}

	if err := repository.UpdateMedia(mediaID, updates); err != nil {
		return nil, fmt.Errorf("更新媒体记录失败: %w", err)
	}

	if oldTmdbID > 0 {
		batchList, err := repository.ListMediaByTmdbID(oldTmdbID, mediaID)
		if err != nil {
			log.Printf("[warn] 查询同组媒体记录失败: %v", err)
		} else {
			for i := range batchList {
				r, err := s.reidentifyMedia(&batchList[i], newTmdbID, mediaType)
				if err != nil {
					log.Printf("[warn] 批量重新识别失败 (id=%d): %v", batchList[i].ID, err)
					continue
				}
				batchUpdates := map[string]any{
					"tmdb_id":    newTmdbID,
					"media_type": r.mediaType,
					"json_data":  r.jsonData,
				}
				if err := repository.UpdateMedia(batchList[i].ID, batchUpdates); err != nil {
					log.Printf("[warn] 批量更新媒体记录失败 (id=%d): %v", batchList[i].ID, err)
				}
			}
		}
	}

	updated, _ := repository.GetMediaByID(mediaID)
	if updated != nil {
		s.hub.Broadcast(ws.Message{
			Type: "media_updated",
			Payload: map[string]any{
				"id":             updated.ID,
				"sha256":         updated.Sha256,
				"tmdb_id":        updated.TMDBID,
				"media_type":     updated.MediaType,
				"suggested_path": extractSuggestedPath(identResult.jsonData),
			},
		})
		return updated, nil
	}

	return media, nil
}

func extractShowName(jsonData model.JSON) string {
	if len(jsonData) == 0 {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return ""
	}
	if title, ok := data["title"].(string); ok && title != "" {
		return title
	}
	if tmdbInfo, ok := data["tmdb_info"].(map[string]any); ok {
		if name, ok := tmdbInfo["name"].(string); ok {
			return name
		}
		if title, ok := tmdbInfo["title"].(string); ok {
			return title
		}
	}
	return ""
}

func extractCleanName(jsonData model.JSON, fallback string) string {
	if len(jsonData) == 0 {
		return fallback
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return fallback
	}
	if name, ok := data["suggested_name"].(string); ok && name != "" {
		return name
	}
	return fallback
}

func extractSuggestedPath(jsonData model.JSON) string {
	if len(jsonData) == 0 {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return ""
	}
	if path, ok := data["suggested_path"].(string); ok && path != "" {
		return path
	}
	return ""
}

func extractYear(jsonData model.JSON) string {
	if len(jsonData) == 0 {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return ""
	}
	if year, ok := data["year"].(string); ok {
		return year
	}
	if tmdbInfo, ok := data["tmdb_info"].(map[string]any); ok {
		if year, ok := tmdbInfo["year"].(string); ok {
			return year
		}
	}
	return ""
}

func (s *UploadService) ResendNewMedia(userID uint, ids []uint, tmdbIDs []int, startTime, endTime string) (int, error) {
	var records []model.MediaWithUser
	var err error

	switch {
	case startTime != "" || endTime != "":
		records, err = repository.ListMediaByTimeRange(startTime, endTime)
	case len(ids) > 0:
		records, err = repository.ListMediaByIDs(ids)
	case len(tmdbIDs) > 0:
		records, err = repository.ListMediaByTmdbIDs(tmdbIDs)
	default:
		return 0, fmt.Errorf("请提供 ids、tmdb_ids 或时间范围参数")
	}

	if err != nil {
		return 0, fmt.Errorf("查询媒体记录失败: %w", err)
	}

	if len(records) == 0 {
		return 0, fmt.Errorf("未找到匹配的媒体记录")
	}

	username := s.fetchUsername(userID)

	for _, m := range records {
		cleanName := extractCleanName(m.JsonData, m.FileName)
		showName := extractShowName(m.JsonData)
		suggestedPath := extractSuggestedPath(m.JsonData)
		title := extractTitle(m.JsonData)
		if title == "" {
			title = cleanName
		}

		payload := map[string]any{
			"id":             m.ID,
			"sha256":         m.Sha256,
			"tmdb_id":        m.TMDBID,
			"title":          cleanName,
			"show_name":      showName,
			"media_type":     m.MediaType,
			"file_name":      m.FileName,
			"file_size":      m.FileSize,
			"username":       username,
			"suggested_path": suggestedPath,
		}
		if m.TMDBID > 0 {
			payload["year"] = extractYear(m.JsonData)
			mediaCount, _ := repository.CountMediaByTmdbID(m.TMDBID)
			payload["count"] = mediaCount
		}
		s.hub.SendToUser(userID, ws.Message{
			Type:    "new_media",
			Payload: payload,
		})
	}

	log.Printf("[resend] 重新推送 %d 条 new_media 消息", len(records))
	return len(records), nil
}

func extractTitle(jsonData model.JSON) string {
	if len(jsonData) == 0 {
		return ""
	}
	var data map[string]any
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return ""
	}
	if tmdbInfo, ok := data["tmdb_info"].(map[string]any); ok {
		if title, ok := tmdbInfo["title"].(string); ok {
			return title
		}
		if name, ok := tmdbInfo["name"].(string); ok {
			return name
		}
	}
	if title, ok := data["title"].(string); ok {
		return title
	}
	return ""
}
