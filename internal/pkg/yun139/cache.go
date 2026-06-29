package yun139

import (
	"sync"
	"time"
)

type CacheItem struct {
	URL       string
	ExpiresAt int64
}

type Cache struct {
	items map[string]*CacheItem
	mu    sync.RWMutex
	ttl   int
}

func NewCache(ttl int) *Cache {
	return &Cache{
		items: make(map[string]*CacheItem),
		ttl:   ttl,
	}
}

func (c *Cache) Get(key string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	item, ok := c.items[key]
	if !ok || item.ExpiresAt < time.Now().Unix() {
		return "", false
	}

	return item.URL, true
}

func (c *Cache) Set(key string, url string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[key] = &CacheItem{
		URL:       url,
		ExpiresAt: time.Now().Unix() + int64(c.ttl),
	}
}
