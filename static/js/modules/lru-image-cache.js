/**
 * LruImageCache — GPU Texture Aware LRU Image Cache
 * Maksimum `maxSize` görüntü tutar; sınır aşıldığında en eski öğeyi
 * GPU texture belleğini serbest bırakarak imha eder.
 */
class LruImageCache {
  constructor(maxSize = 30) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  has(key) {
    return this.cache.has(key);
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const img = this.cache.get(key);
    // LRU: En son kullanılanı en sona taşı
    this.cache.delete(key);
    this.cache.set(key, img);
    return img;
  }

  set(key, img) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // En eski öğeyi al ve GPU texture'unu imha et
      const oldestKey = this.cache.keys().next().value;
      const oldestImg = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this._destroyImage(oldestImg);
    }
    this.cache.set(key, img);
    return this;
  }

  delete(key) {
    if (!this.cache.has(key)) return false;
    const img = this.cache.get(key);
    this.cache.delete(key);
    this._destroyImage(img);
    return true;
  }

  clear() {
    for (const img of this.cache.values()) {
      this._destroyImage(img);
    }
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }

  [Symbol.iterator]() {
    return this.cache[Symbol.iterator]();
  }

  entries() {
    return this.cache.entries();
  }

  keys() {
    return this.cache.keys();
  }

  values() {
    return this.cache.values();
  }

  _destroyImage(img) {
    if (img && typeof img === 'object') {
      try {
        img.onload = null;
        img.onerror = null;
        img.src = '';
      } catch (_) {}
    }
  }
}

// Global'e export et — editor.js ve diğer modüller bu class'a erişebilir
window.LruImageCache = LruImageCache;
