package yun139

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	PersonalURL = "https://personal-kd-njs.yun.139.com"
)

type Client struct {
	Authorization string
	Account       string
	ParentID      string
	HTTPClient    *http.Client
	TokenExpiresAt int64
}

func NewClient(authorization string, parentID string) (*Client, error) {
	decoded, err := base64.StdEncoding.DecodeString(authorization)
	if err != nil {
		return nil, fmt.Errorf("authorization 解码失败: %w", err)
	}

	parts := strings.Split(string(decoded), ":")
	if len(parts) < 2 {
		return nil, fmt.Errorf("authorization 格式错误")
	}

	account := parts[1]

	return &Client{
		Authorization: authorization,
		Account:       account,
		ParentID:      parentID,
		HTTPClient:    &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func urlEncode(s string) string {
	return url.QueryEscape(s)
}

func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func (c *Client) calculateSign(body string, ts string, randStr string) string {
	encoded := urlEncode(body)

	sortedChars := strings.Split(encoded, "")
	sort.Strings(sortedChars)
	sortedStr := strings.Join(sortedChars, "")

	b64 := base64.StdEncoding.EncodeToString([]byte(sortedStr))

	md5Body := fmt.Sprintf("%x", md5.Sum([]byte(b64)))
	md5Ts := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%s:%s", ts, randStr))))

	combined := md5Body + md5Ts
	finalMD5 := fmt.Sprintf("%x", md5.Sum([]byte(combined)))

	return strings.ToUpper(finalMD5)
}

func (c *Client) getHeaders(body string, isPersonal bool) map[string]string {
	randStr := randomString(16)
	ts := time.Now().Format("2006-01-02 15:04:05")
	sign := c.calculateSign(body, ts, randStr)

	svcType := "1"
	chromeVer := "148.0.0.0"
	osVer := "windows 11"
	clientVer := "1.0.0"

	headers := map[string]string{
		"Accept":              "application/json, text/plain, */*",
		"Authorization":       "Basic " + c.Authorization,
		"mcloud-channel":      "1000101",
		"mcloud-client":       "10701",
		"mcloud-sign":         fmt.Sprintf("%s,%s,%s", ts, randStr, sign),
		"mcloud-version":      "7.14.0",
		"Origin":              "https://yun.139.com",
		"Referer":             "https://yun.139.com/w/",
		"x-DeviceInfo":        fmt.Sprintf("||9|%s|chrome|%s|||%s||zh-CN|||", clientVer, chromeVer, osVer),
		"x-huawei-channelSrc": "10200153",
		"x-inner-ntwk":        "2",
		"x-m4c-caller":        "PC",
		"x-m4c-src":           "10002",
		"x-SvcType":           svcType,
		"Content-Type":        "application/json",
	}

	if isPersonal {
		headers["Caller"] = "web"
		headers["Mcloud-Route"] = "001"
		headers["X-Yun-Api-Version"] = "v1"
		headers["X-Yun-App-Channel"] = "10200153"
		headers["X-Yun-Channel-Source"] = "10200153"
		headers["X-Yun-Client-Info"] = fmt.Sprintf("||9|%s|chrome|%s|||%s||zh-CN|||", clientVer, chromeVer, osVer)
		headers["X-Yun-Module-Type"] = "100"
		headers["X-Yun-Svc-Type"] = "1"
	}

	return headers
}

func (c *Client) request(path string, data map[string]interface{}, isPersonal bool) (map[string]interface{}, error) {
	reqURL := PersonalURL + path
	body, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("JSON 编码失败: %w", err)
	}

	req, err := http.NewRequest("POST", reqURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	headers := c.getHeaders(string(body), isPersonal)
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("JSON 解码失败: %w", err)
	}

	if success, ok := result["success"].(bool); !ok || !success {
		errCode, _ := result["code"].(string)
		errMsg, _ := result["message"].(string)
		return nil, fmt.Errorf("API 错误: %s (code: %s)", errMsg, errCode)
	}

	return result, nil
}

func (c *Client) RapidUpload(sha256 string, size int64, filename string) (string, error) {
	data := map[string]interface{}{
		"contentHash":          sha256,
		"contentHashAlgorithm": "SHA256",
		"contentType":          "application/octet-stream",
		"fileRenameMode":       "auto_rename",
		"name":                 filename,
		"parentFileId":         c.ParentID,
		"partInfos": []map[string]interface{}{
			{
				"partNumber": 1,
				"partSize":   1000,
				"parallelHashCtx": map[string]interface{}{
					"partOffset": 0,
				},
			},
		},
		"size":           size,
		"type":           "file",
		"parallelUpload": true,
	}

	result, err := c.request("/hcy/file/create", data, true)
	if err != nil {
		return "", err
	}

	uploadData, ok := result["data"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("响应格式错误")
	}

	fileId, ok := uploadData["fileId"].(string)
	if !ok {
		return "", fmt.Errorf("fileId 不存在")
	}

	return fileId, nil
}

func (c *Client) GetDownloadURL(fileId string) (string, error) {
	data := map[string]interface{}{
		"fileId": fileId,
	}

	result, err := c.request("/hcy/file/getDownloadUrl", data, true)
	if err != nil {
		return "", err
	}

	data2, ok := result["data"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("响应格式错误")
	}

	if cdnURL, ok := data2["cdnUrl"].(string); ok && cdnURL != "" {
		return cdnURL, nil
	}

	downloadURL, ok := data2["url"].(string)
	if !ok {
		return "", fmt.Errorf("下载链接不存在")
	}

	return downloadURL, nil
}
