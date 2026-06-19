package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/liyk-master/media-tracker/internal/config"
)

type IdentifyRequest struct {
	FilePath string `json:"file_path"`
}

type IdentifyResponse struct {
	Success       bool                   `json:"success"`
	OriginalName  string                 `json:"original_name"`
	Title         string                 `json:"title"`
	Year          int                    `json:"year"`
	Season        int                    `json:"season"`
	Episode       int                    `json:"episode"`
	MediaType     string                 `json:"media_type"`
	TmdbMatched   bool                   `json:"tmdb_matched"`
	TmdbInfo      map[string]interface{} `json:"tmdb_info"`
	SuggestedName string                 `json:"suggested_name"`
	SuggestedPath string                 `json:"suggested_path"`
	Confidence    float64                `json:"confidence"`
	ReleaseGroup  string                 `json:"release_group"`
	QualityTags   string                 `json:"quality_tags"`
}

type authLoginResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
}

type IdentifierService struct {
	client *http.Client
	mu     sync.Mutex
	token  string
}

func NewIdentifierService() *IdentifierService {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	transport := &http.Transport{
		MaxConnsPerHost:       20,
		MaxIdleConns:          20,
		MaxIdleConnsPerHost:   20,
		DisableCompression:    true,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			t := time.Now()
			conn, err := dialer.DialContext(ctx, network, addr)
			log.Printf("[identifier]   TCP 连接 %s (%v)", addr, time.Since(t))
			return conn, err
		},
	}
	return &IdentifierService{
		client: &http.Client{
			Timeout:   time.Duration(config.Conf.Identifier.TimeoutSeconds) * time.Second,
			Transport: transport,
		},
	}
}

func (s *IdentifierService) doLogin() error {
	cfg := config.Conf.Identifier
	body, err := json.Marshal(map[string]string{
		"username": cfg.Username,
		"password": cfg.Password,
	})
	if err != nil {
		return fmt.Errorf("marshal login: %w", err)
	}

	resp, err := s.client.Post(cfg.AuthURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("call login API: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read login response: %w", err)
	}

	var result authLoginResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("unmarshal login response: %w", err)
	}

	if result.AccessToken == "" {
		return fmt.Errorf("login failed: empty access_token")
	}

	s.token = result.AccessToken
	return nil
}

func (s *IdentifierService) ensureLogin() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.token != "" {
		return nil
	}

	t := time.Now()
	log.Printf("[identifier] 登录中...")
	err := s.doLogin()
	if err != nil {
		return err
	}
	log.Printf("[identifier] 登录完成 (%v)", time.Since(t))
	return nil
}

func (s *IdentifierService) reLogin() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	t := time.Now()
	log.Printf("[identifier] 重新登录中...")
	err := s.doLogin()
	if err != nil {
		return err
	}
	log.Printf("[identifier] 重新登录完成 (%v)", time.Since(t))
	return nil
}

func (s *IdentifierService) Identify(filePath string) (*IdentifyResponse, error) {
	log.Printf("[identifier] === 开始识别 %q", shortName(filePath))
	startAll := time.Now()

	if err := s.ensureLogin(); err != nil {
		return nil, fmt.Errorf("identifier auth: %w", err)
	}

	body, err := json.Marshal(IdentifyRequest{FilePath: filePath})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", config.Conf.Identifier.APIURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.token)

	log.Printf("[identifier]   HTTP 请求发送中...")
	tHTTP := time.Now()
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call identify API: %w", err)
	}
	durHTTP := time.Since(tHTTP)
	log.Printf("[identifier]   HTTP 响应已接收 (%v), status=%d", durHTTP, resp.StatusCode)
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		log.Printf("[identifier] token 失效，重新登录")
		if err := s.reLogin(); err != nil {
			return nil, fmt.Errorf("re-login failed: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+s.token)
		tHTTP = time.Now()
		resp, err = s.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("retry identify API: %w", err)
		}
		durHTTP = time.Since(tHTTP)
		log.Printf("[identifier]   HTTP 重试响应已接收 (%v)", durHTTP)
		defer resp.Body.Close()
	}

	log.Printf("[identifier]   读取响应体...")
	tRead := time.Now()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	log.Printf("[identifier]   响应体读取完成 (%v), size=%d", time.Since(tRead), len(respBody))

	log.Printf("[identifier]   解析 JSON...")
	tParse := time.Now()
	var result IdentifyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	log.Printf("[identifier]   JSON 解析完成 (%v)", time.Since(tParse))

	log.Printf("[identifier] === 识别完成 %q, 总耗时 %v (HTTP %v, read %v, parse %v)",
		result.OriginalName, time.Since(startAll), durHTTP, time.Since(tRead), time.Since(tParse))
	return &result, nil
}

func shortName(name string) string {
	if len(name) <= 60 {
		return name
	}
	return name[:57] + "..."
}
