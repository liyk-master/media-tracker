package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/liyk-master/media-tracker/internal/config"
	"github.com/liyk-master/media-tracker/pkg/response"
)

type TMDBHandler struct {
	baseURL   string
	posterURL string
	apiKey    string
	client    *http.Client
}

func NewTMDBHandler() *TMDBHandler {
	h := &TMDBHandler{
		apiKey:    config.Conf.TMDB.APIKey,
		baseURL:   "https://api.themoviedb.org/3",
		posterURL: "https://image.tmdb.org/t/p/w185",
		client:    &http.Client{},
	}
	if config.Conf.TMDB.ProxyURL != "" {
		h.baseURL = strings.TrimRight(config.Conf.TMDB.ProxyURL, "/")
	}
	if config.Conf.TMDB.PosterBase != "" {
		h.posterURL = strings.TrimRight(config.Conf.TMDB.PosterBase, "/")
	}
	return h
}

func (h *TMDBHandler) Poster(c *gin.Context) {
	mediaType := c.Param("type")
	tmdbID := c.Param("id")

	if h.apiKey == "" {
		c.Status(http.StatusNotFound)
		return
	}

	if mediaType != "movie" && mediaType != "tv" {
		c.Status(http.StatusNotFound)
		return
	}

	apiURL := fmt.Sprintf("%s/%s/%s?api_key=%s", h.baseURL, mediaType, tmdbID, url.QueryEscape(h.apiKey))

	resp, err := h.client.Get(apiURL)
	if err != nil {
		response.Error(c, "查询TMDB失败: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.Status(http.StatusNotFound)
		return
	}

	var tmdbInfo struct {
		PosterPath string `json:"poster_path"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tmdbInfo); err != nil {
		response.Error(c, "解析TMDB响应失败: "+err.Error())
		return
	}

	if tmdbInfo.PosterPath == "" {
		c.Status(http.StatusNotFound)
		return
	}

	posterFullURL := h.posterURL + tmdbInfo.PosterPath

	imgResp, err := h.client.Get(posterFullURL)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer imgResp.Body.Close()

	if imgResp.StatusCode != http.StatusOK {
		c.Status(http.StatusNotFound)
		return
	}

	contentType := imgResp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "public, max-age=86400")
	c.Status(imgResp.StatusCode)
	io.Copy(c.Writer, imgResp.Body)
}
