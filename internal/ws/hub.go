package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/liyk-master/media-tracker/internal/repository"
	"github.com/liyk-master/media-tracker/pkg/jwt"
)

type Message struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID uint
	send   chan []byte
}

type Hub struct {
	mu       sync.RWMutex
	clients  map[uint]map[*Client]bool
	upgrader websocket.Upgrader
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[uint]map[*Client]bool),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "缺少 token", http.StatusUnauthorized)
		return
	}

	var userID uint

	claims, err := jwt.ParseToken(token)
	if err == nil {
		userID = claims.UserID
	} else {
		user, err := repository.GetUserByAPIKey(token)
		if err != nil {
			http.Error(w, "无效 token", http.StatusUnauthorized)
			return
		}
		userID = user.ID
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}

	client := &Client{
		hub:    h,
		conn:   conn,
		userID: userID,
		send:   make(chan []byte, 256),
	}

	h.register(client)
	go client.writePump()
	go client.readPump()
}

func (h *Hub) register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.userID] == nil {
		h.clients[client.userID] = make(map[*Client]bool)
	}

	h.clients[client.userID][client] = true
	log.Printf("WebSocket 用户 %d 已连接 (总连接数: %d)", client.userID, len(h.clients[client.userID]))
}

func (h *Hub) unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if userClients, ok := h.clients[client.userID]; ok {
		if userClients[client] {
			delete(userClients, client)
			close(client.send)

			if len(userClients) == 0 {
				delete(h.clients, client.userID)
				log.Printf("WebSocket 用户 %d 已断开 (所有连接已关闭)", client.userID)
			} else {
				log.Printf("WebSocket 用户 %d 已断开一个连接 (剩余连接数: %d)", client.userID, len(userClients))
			}
		}
	}
}

func (h *Hub) SendToUser(userID uint, msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("序列化消息失败: %v", err)
		return
	}

	h.mu.RLock()
	userClients, ok := h.clients[userID]
	h.mu.RUnlock()

	if !ok || len(userClients) == 0 {
		log.Printf("[ws] 用户 %d 未连接，丢弃消息 type=%s", userID, msg.Type)
		return
	}

	successCount := 0
	for client := range userClients {
		select {
		case client.send <- data:
			successCount++
		default:
			log.Printf("[ws] 用户 %d 的某个连接消息队列已满，丢弃消息 type=%s", userID, msg.Type)
		}
	}

	if successCount > 0 {
		log.Printf("[ws] SendToUser %d type=%s 成功推送到 %d 个连接", userID, msg.Type, successCount)
	}
}

func (h *Hub) Broadcast(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("序列化消息失败: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	count := 0
	for _, userClients := range h.clients {
		for client := range userClients {
			select {
			case client.send <- data:
				count++
			default:
				log.Printf("[ws] 用户 %d 的某个连接消息队列已满，丢弃消息 type=%s", client.userID, msg.Type)
			}
		}
	}
	if count > 0 {
		log.Printf("[ws] Broadcast type=%s 已推送到 %d 个连接", msg.Type, count)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("WebSocket 读取错误: %v", err)
			}
			break
		}
	}
}


