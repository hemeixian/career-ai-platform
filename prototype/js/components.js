// ============================================================
// 职引未来 · 统一样式组件 JavaScript 实现
// UnifiedSelect / PasswordInput / AvatarUploader / 
// SchoolSearchSelect / DefaultAvatar / TagSelector
// ============================================================

// 从全局配置获取选项
const OPTIONS = window.APP_OPTIONS || {};

// ============ 1. UnifiedSelect 统一下拉选择框 ============
class UnifiedSelect {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options.options || [];
    this.placeholder = options.placeholder || '请选择';
    this.value = options.value || '';
    this.onChange = options.onChange || (() => {});
    this.searchable = options.searchable || false;
    this.showCustom = options.showCustom || false;
    this.customPlaceholder = options.customPlaceholder || '自定义输入';
    this.name = options.name || '';
    
    this.searchQuery = '';
    this.activeIndex = -1;
    
    this.init();
  }
  
  init() {
    this.container.classList.add('unified-select');
    this.container.innerHTML = `
      <div class="unified-select-display">
        <span class="${this.value ? '' : 'unified-select-placeholder'}">${this.value || this.placeholder}</span>
        <i class="fa-solid fa-chevron-down unified-select-arrow"></i>
      </div>
      <div class="unified-select-options">
        ${this.searchable ? `
          <div class="unified-select-search">
            <input type="text" placeholder="搜索..." />
          </div>
        ` : ''}
        <div class="unified-select-list"></div>
        ${this.showCustom ? `<div class="unified-select-custom"><i class="fa-solid fa-plus"></i>${this.customPlaceholder}</div>` : ''}
      </div>
    `;
    
    this.display = this.container.querySelector('.unified-select-display');
    this.placeholderEl = this.display.querySelector('span');
    this.optionsContainer = this.container.querySelector('.unified-select-options');
    this.optionsList = this.container.querySelector('.unified-select-list');
    this.customBtn = this.container.querySelector('.unified-select-custom');
    this.searchInput = this.container.querySelector('.unified-select-search input');
    
    this.renderOptions();
    this.bindEvents();
  }
  
  renderOptions() {
    const filtered = this.getFilteredOptions();
    
    if (filtered.length === 0 && !this.showCustom) {
      this.optionsList.innerHTML = `<div class="unified-select-empty">暂无选项</div>`;
      return;
    }
    
    this.optionsList.innerHTML = filtered.map((opt, i) => `
      <div class="unified-select-option ${this.value === opt.value ? 'selected' : ''} ${i === this.activeIndex ? 'highlight' : ''}" 
           data-value="${opt.value}" 
           data-label="${opt.label || opt.value}"
           data-index="${i}">
        <span>${this.highlightMatch(opt.label || opt.value)}</span>
        <i class="fa-solid fa-check"></i>
      </div>
    `).join('');
    
    this.bindOptionEvents();
  }
  
  getFilteredOptions() {
    if (!this.searchQuery) return this.options;
    const query = this.searchQuery.toLowerCase();
    return this.options.filter(opt => {
      const val = (opt.value || opt.label || '').toLowerCase();
      return val.includes(query);
    });
  }
  
  highlightMatch(text) {
    if (!this.searchQuery) return text;
    const query = this.searchQuery;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + `<b style="color:#6D5EF6">${text.slice(idx, idx + query.length)}</b>` + text.slice(idx + query.length);
  }
  
  bindEvents() {
    this.display.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.activeIndex = -1;
        this.renderOptions();
      });
      
      this.searchInput.addEventListener('keydown', (e) => {
        const items = this.optionsList.querySelectorAll('.unified-select-option');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.activeIndex = Math.min(this.activeIndex + 1, items.length - 1);
          this.renderOptions();
          if (items[this.activeIndex]) items[this.activeIndex].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.activeIndex = Math.max(this.activeIndex - 1, -1);
          this.renderOptions();
        } else if (e.key === 'Enter' && this.activeIndex >= 0) {
          e.preventDefault();
          if (items[this.activeIndex]) items[this.activeIndex].click();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });
    }
    
    if (this.customBtn) {
      this.customBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const customValue = prompt(`请输入${this.customPlaceholder}：`);
        if (customValue && customValue.trim()) {
          // 添加到选项列表
          if (!this.options.find(o => o.value === customValue.trim())) {
            this.options.push({ value: customValue.trim(), label: customValue.trim() });
          }
          this.setValue(customValue.trim());
          this.close();
        }
      });
    }
  }
  
  bindOptionEvents() {
    const items = this.optionsList.querySelectorAll('.unified-select-option');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setValue(item.dataset.value);
        this.close();
      });
    });
  }
  
  toggle() {
    if (this.container.classList.contains('open')) {
      this.close();
    } else {
      this.open();
    }
  }
  
  open() {
    // 关闭其他下拉框
    document.querySelectorAll('.unified-select.open').forEach(el => {
      if (el !== this.container) el.classList.remove('open');
    });
    
    this.container.classList.add('open');
    this.display.classList.add('active');
    
    if (this.searchInput) {
      this.searchQuery = '';
      this.renderOptions();
      setTimeout(() => this.searchInput.focus(), 50);
    } else {
      // 自动滚动到选中项
      const selected = this.optionsList.querySelector('.selected');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  }
  
  close() {
    this.container.classList.remove('open');
    this.display.classList.remove('active');
  }
  
  setValue(value) {
    this.value = value;
    if (value) {
      this.placeholderEl.textContent = value;
      this.placeholderEl.classList.remove('unified-select-placeholder');
    } else {
      this.placeholderEl.textContent = this.placeholder;
      this.placeholderEl.classList.add('unified-select-placeholder');
    }
    this.renderOptions();
    this.onChange(value);
  }
  
  getValue() {
    return this.value;
  }
  
  // 静态方法：用于初始化页面所有带有 data-unified-select 属性的元素
  static initAll(root = document) {
    root.querySelectorAll('[data-unified-select]').forEach(el => {
      const config = {
        placeholder: el.dataset.placeholder || '请选择',
        value: el.dataset.value || '',
        searchable: el.dataset.searchable === 'true',
        showCustom: el.dataset.showCustom === 'true',
        customPlaceholder: el.dataset.customPlaceholder || '自定义输入',
        name: el.dataset.name || '',
        options: []
      };
      
      const optionsData = el.dataset.options;
      if (optionsData === 'grades') config.options = OPTIONS.GRADE_OPTIONS || [];
      else if (optionsData === 'positions') config.options = (OPTIONS.TARGET_POSITIONS || []).map(p => ({ value: p, label: p }));
      
      el.innerHTML = '';
      new UnifiedSelect(el, {
        ...config,
        onChange: (val) => {
          const event = new CustomEvent('change', { detail: { value: val } });
          el.dispatchEvent(event);
        }
      });
    });
  }
}

// ============ 2. PasswordInput 密码输入组件 ============
class PasswordInput {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options || {};
    this.id = this.options.id || 'password';
    this.placeholder = this.options.placeholder || '请输入密码';
    this.minLength = this.options.minLength || 6;
    this.hasConfirm = this.options.hasConfirm || false;
    this.onStrengthChange = this.options.onStrengthChange || (() => {});
    this.onMatchChange = this.options.onMatchChange || (() => {});
    
    this.init();
  }
  
  init() {
    this.container.innerHTML = `
      <div class="password-input-wrapper">
        <input type="password" 
               class="password-input" 
               id="${this.id}" 
               placeholder="${this.placeholder}"
               autocomplete="new-password" />
        <button type="button" class="password-toggle" data-target="${this.id}">
          <i class="fa-regular fa-eye"></i>
        </button>
      </div>
      <div class="password-strength">
        <div class="password-strength-bar">
          <div class="password-strength-segment" data-level="0"></div>
          <div class="password-strength-segment" data-level="1"></div>
          <div class="password-strength-segment" data-level="2"></div>
        </div>
        <span class="password-strength-label">弱</span>
      </div>
      ${this.hasConfirm ? `
        <div class="password-input-wrapper" style="margin-top:8px">
          <input type="password" 
                 class="password-input" 
                 id="${this.id}-confirm" 
                 placeholder="确认密码"
                 autocomplete="new-password" />
          <button type="button" class="password-toggle" data-target="${this.id}-confirm">
            <i class="fa-regular fa-eye"></i>
          </button>
        </div>
        <div class="password-match"></div>
      ` : ''}
    `;
    
    this.input = this.container.querySelector(`#${this.id}`);
    this.confirmInput = this.hasConfirm ? this.container.querySelector(`#${this.id}-confirm`) : null;
    this.toggleBtn = this.container.querySelector('.password-toggle');
    this.strengthBar = this.container.querySelector('.password-strength-bar');
    this.strengthLabel = this.container.querySelector('.password-strength-label');
    this.matchEl = this.container.querySelector('.password-match');
    
    this.bindEvents();
  }
  
  bindEvents() {
    this.input.addEventListener('input', () => {
      this.updateStrength();
      this.checkMatch();
    });
    
    if (this.confirmInput) {
      this.confirmInput.addEventListener('input', () => {
        this.checkMatch();
      });
    }
    
    this.container.querySelectorAll('.password-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        const icon = btn.querySelector('i');
        
        if (input.type === 'password') {
          input.type = 'text';
          icon.className = 'fa-regular fa-eye-slash';
        } else {
          input.type = 'password';
          icon.className = 'fa-regular fa-eye';
        }
      });
    });
  }
  
  calculateStrength(password) {
    if (!password || password.length < this.minLength) return 0;
    
    let score = 0;
    
    // 长度奖励
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    
    // 字符类型检查
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    
    const types = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (types <= 1) score = Math.max(score, 1);
    else if (types === 2) score = Math.max(score, 2);
    else if (types >= 3) score = 3;
    
    return Math.min(score, 3);
  }
  
  updateStrength() {
    const password = this.input.value;
    const strength = this.calculateStrength(password);
    
    const segments = this.strengthBar.querySelectorAll('.password-strength-segment');
    const levels = ['weak', 'medium', 'strong'];
    const labels = ['弱', '中', '强'];
    
    segments.forEach((seg, i) => {
      seg.classList.remove('active', 'weak', 'medium', 'strong');
      if (i < strength) {
        seg.classList.add('active', levels[strength - 1]);
      }
    });
    
    this.strengthLabel.className = 'password-strength-label' + (strength > 0 ? ' ' + levels[strength - 1] : '');
    this.strengthLabel.textContent = strength > 0 ? labels[strength - 1] : '弱';
    
    this.onStrengthChange(strength);
  }
  
  checkMatch() {
    if (!this.hasConfirm || !this.confirmInput) return;
    
    const pwd = this.input.value;
    const confirmPwd = this.confirmInput.value;
    
    if (!confirmPwd) {
      this.matchEl.textContent = '';
      this.matchEl.className = 'password-match';
      this.onMatchChange(null);
      return;
    }
    
    if (pwd === confirmPwd && pwd.length >= this.minLength) {
      this.matchEl.textContent = '✓ 密码一致';
      this.matchEl.className = 'password-match matched';
      this.onMatchChange(true);
    } else {
      this.matchEl.textContent = '✗ 密码不一致';
      this.matchEl.className = 'password-match mismatched';
      this.onMatchChange(false);
    }
  }
  
  getValue() {
    return this.input.value;
  }
  
  getConfirmValue() {
    return this.confirmInput ? this.confirmInput.value : null;
  }
  
  isMatch() {
    if (!this.hasConfirm) return null;
    return this.input.value === this.confirmInput.value && this.input.value.length >= this.minLength;
  }
}

// ============ 3. DefaultAvatar 默认头像生成 ============
class DefaultAvatar {
  static COLORS = ['#6D5EF6', '#0EA5B7', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];
  
  static generate(name, colorIndex = -1) {
    const letter = (name || '?').charAt(0).toUpperCase();
    
    // 根据名字稳定选择颜色
    if (colorIndex === -1) {
      const hash = this.hashCode(name || '');
      colorIndex = hash % this.COLORS.length;
    }
    
    const color = this.COLORS[colorIndex];
    
    return `
      <div class="default-avatar">
        <div class="default-avatar-gradient" style="background: linear-gradient(135deg, ${color}, ${this.getGradientEnd(color)})"></div>
        <span class="default-avatar-text">${letter}</span>
      </div>
    `;
  }
  
  static getGradientEnd(color) {
    const map = {
      '#6D5EF6': '#8B7FF8',
      '#0EA5B7': '#14C3DA',
      '#F59E0B': '#FBBF24',
      '#EF4444': '#F87171',
      '#10B981': '#34D399',
      '#8B5CF6': '#A78BFA',
      '#EC4899': '#F472B6',
      '#F97316': '#FB923C'
    };
    return map[color] || color;
  }
  
  static hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
  
  static setAvatarByDefault(container, name) {
    const html = this.generate(name);
    container.innerHTML = html;
    container.classList.add('default-avatar-container');
  }
}

// ============ 4. AvatarUploader 头像上传组件 ============
class AvatarUploader {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options || {};
    this.value = this.options.value || '';
    this.presets = OPTIONS.PRESET_AVATARS || [];
    this.allowUpload = this.options.allowUpload !== false;
    this.allowPreset = this.options.allowPreset !== false;
    this.sizeLimit = this.options.sizeLimit || 2 * 1024 * 1024; // 2MB
    this.onChange = this.options.onChange || (() => {});
    this.onUpload = this.options.onUpload || (() => {});
    
    this.init();
  }
  
  init() {
    this.container.classList.add('avatar-uploader');
    this.container.innerHTML = `
      <div class="avatar-preview" id="avatar-preview">
        ${this.value ? `<img src="${this.value}" alt="头像" />` : DefaultAvatar.generate(this.options.name || 'U')}
        <div class="avatar-overlay">
          <i class="fa-solid fa-camera"></i>
          <span>更换头像</span>
        </div>
      </div>
      <div class="avatar-actions">
        ${this.allowUpload ? `
          <input type="file" accept="image/jpeg,image/png,image/webp" 
                 class="avatar-file-input" style="display:none" />
          <button type="button" class="avatar-btn avatar-btn-primary" id="avatar-upload-btn">
            <i class="fa-solid fa-upload"></i>上传照片
          </button>
        ` : ''}
      </div>
      ${this.allowPreset ? `
        <div class="avatar-preset">
          <div class="avatar-preset-title">或选择预设头像</div>
          ${this.presets.map((preset, i) => `
            <div class="avatar-preset-item ${this.value === 'preset-' + i ? 'selected' : ''}" 
                 data-preset="${i}"
                 style="background: linear-gradient(135deg, ${preset.color}, ${DefaultAvatar.getGradientEnd(preset.color)})">
              ${preset.emoji}
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    
    this.preview = this.container.querySelector('#avatar-preview');
    this.fileInput = this.container.querySelector('.avatar-file-input');
    this.uploadBtn = this.container.querySelector('#avatar-upload-btn');
    this.presetItems = this.container.querySelectorAll('.avatar-preset-item');
    
    this.bindEvents();
  }
  
  bindEvents() {
    if (this.uploadBtn && this.fileInput) {
      this.uploadBtn.addEventListener('click', () => this.fileInput.click());
    }
    
    if (this.preview) {
      this.preview.addEventListener('click', () => {
        if (this.allowUpload) this.fileInput.click();
      });
    }
    
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => this.handleFileChange(e));
    }
    
    this.presetItems.forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.preset);
        const preset = this.presets[index];
        const presetValue = `preset-${index}`;
        
        this.value = presetValue;
        this.updatePreview(`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${preset.color}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="48">${preset.emoji}</text></svg>`)}`);
        
        this.presetItems.forEach(p => p.classList.remove('selected'));
        item.classList.add('selected');
        
        this.onChange(presetValue);
        this.onUpload(presetValue);
      });
    });
  }
  
  handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // 检查文件类型
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('请上传 JPG/PNG/WebP 格式的图片', 'info');
      return;
    }
    
    // 检查文件大小
    if (file.size > this.sizeLimit) {
      showToast('图片大小不能超过 2MB', 'info');
      return;
    }
    
    // 读取文件并打开裁剪器
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.openCropper(ev.target.result);
    };
    reader.readAsDataURL(file);
  }
  
  openCropper(imageSrc) {
    const cropper = new AvatarCropper(imageSrc, (croppedDataUrl) => {
      this.value = croppedDataUrl;
      this.updatePreview(croppedDataUrl);
      this.onChange(croppedDataUrl);
      this.onUpload(croppedDataUrl);
      
      // 清除预设选中状态
      this.presetItems.forEach(p => p.classList.remove('selected'));
    });
    cropper.open();
  }
  
  updatePreview(src) {
    this.preview.innerHTML = `<img src="${src}" alt="头像" />
      <div class="avatar-overlay">
        <i class="fa-solid fa-camera"></i>
        <span>更换头像</span>
      </div>`;
  }
  
  setValue(value) {
    this.value = value;
    if (value) {
      this.updatePreview(value);
    } else {
      this.preview.innerHTML = `${DefaultAvatar.generate(this.options.name || 'U')}
        <div class="avatar-overlay">
          <i class="fa-solid fa-camera"></i>
          <span>更换头像</span>
        </div>`;
    }
  }
  
  getValue() {
    return this.value;
  }
}

// ============ 5. AvatarCropper 头像裁剪组件 ============
class AvatarCropper {
  constructor(imageSrc, onComplete) {
    this.imageSrc = imageSrc;
    this.onComplete = onComplete;
    this.scale = 1;
    this.maxScale = 3;
    this.minScale = 0.5;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.imageX = 0;
    this.imageY = 0;
    
    this.init();
  }
  
  init() {
    this.modal = document.createElement('div');
    this.modal.className = 'avatar-cropper-modal';
    this.modal.innerHTML = `
      <div class="avatar-cropper-container">
        <div class="avatar-cropper-title">裁剪头像</div>
        <div class="avatar-cropper-area">
          <img alt="待裁剪图片" />
          <div class="avatar-cropper-grid"></div>
        </div>
        <div class="avatar-cropper-controls">
          <label>缩放</label>
          <input type="range" min="0.5" max="3" step="0.1" value="1" />
        </div>
        <div class="avatar-cropper-actions">
          <button type="button" class="btn-ghost px-4 py-2 rounded-lg text-sm" data-action="cancel">取消</button>
          <button type="button" class="btn-primary px-4 py-2 rounded-lg text-sm" data-action="confirm">确认裁剪</button>
        </div>
      </div>
    `;
    
    this.img = this.modal.querySelector('img');
    this.area = this.modal.querySelector('.avatar-cropper-area');
    this.slider = this.modal.querySelector('input[type="range"]');
    
    // 使用 DOM 属性安全设置图片源（避免 innerHTML 嵌入超长 base64 导致解析异常）
    this.img.src = this.imageSrc;
    
    this.modal.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'cancel') {
          this.close();
        } else if (action === 'confirm') {
          this.crop();
        }
      });
    });
    
    this.bindDragEvents();
  }
  
  open() {
    document.body.appendChild(this.modal);
    
    // 图片加载完成后确保 transform 正确应用
    this.img.onload = () => {
      if (this.naturalWidth) {
        this.updateTransform();
      } else {
        // 如果 naturalWidth 没有被设置，使用 img 的实际尺寸
        this.naturalWidth = this.img.naturalWidth || this.img.width || 200;
        this.naturalHeight = this.img.naturalHeight || this.img.height || 200;
        this.setupInitialPosition();
      }
    };
    
    // 加载图片后设置初始位置
    const tempImg = new Image();
    tempImg.onload = () => {
      this.naturalWidth = tempImg.width;
      this.naturalHeight = tempImg.height;
      this.setupInitialPosition();
    };
    tempImg.onerror = () => {
      // tempImg 加载失败时，使用默认尺寸
      this.naturalWidth = this.img.naturalWidth || this.img.width || 200;
      this.naturalHeight = this.img.naturalHeight || this.img.height || 200;
      this.setupInitialPosition();
    };
    tempImg.src = this.imageSrc;
    
    this.slider.addEventListener('input', (e) => {
      this.scale = parseFloat(e.target.value);
      this.updateTransform();
    });
  }
  
  close() {
    this.modal.remove();
  }
  
  setupInitialPosition() {
    // 确保 naturalWidth/naturalHeight 有有效值
    this.naturalWidth = this.naturalWidth || this.img?.naturalWidth || this.img?.width || 200;
    this.naturalHeight = this.naturalHeight || this.img?.naturalHeight || this.img?.height || 200;
    
    const areaSize = this.area.offsetWidth;
    const aspectRatio = this.naturalWidth / this.naturalHeight;
    
    // 计算初始缩放，使图片覆盖裁剪区域
    if (aspectRatio > 1) {
      // 横向图片：高度填满
      this.baseScale = areaSize / this.naturalHeight;
    } else {
      // 纵向图片：宽度填满
      this.baseScale = areaSize / this.naturalWidth;
    }
    
    this.scale = this.baseScale;
    this.imageX = 0;
    this.imageY = 0;
    
    this.slider.min = this.baseScale;
    this.slider.max = this.baseScale * 3;
    this.slider.step = 0.1;
    this.slider.value = this.scale;
    
    this.updateTransform();
  }
  
  updateTransform() {
    const scaledWidth = this.naturalWidth * this.scale;
    const scaledHeight = this.naturalHeight * this.scale;
    
    // 居中显示
    this.img.style.width = this.naturalWidth + 'px';
    this.img.style.height = this.naturalHeight + 'px';
    this.img.style.transform = `translate(-50%, -50%) scale(${this.scale}) translate(${this.imageX / this.scale}px, ${this.imageY / this.scale}px)`;
  }
  
  bindDragEvents() {
    this.area.addEventListener('mousedown', (e) => this.startDrag(e));
    this.area.addEventListener('mousemove', (e) => this.onDrag(e));
    this.area.addEventListener('mouseup', () => this.stopDrag());
    this.area.addEventListener('mouseleave', () => this.stopDrag());
    
    // 触摸支持
    this.area.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    this.area.addEventListener('touchmove', (e) => this.onDrag(e.touches[0]));
    this.area.addEventListener('touchend', () => this.stopDrag());
    
    // 滚轮缩放
    this.area.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.scale = Math.max(this.slider.min, Math.min(this.slider.max, this.scale + delta));
      this.slider.value = this.scale;
      this.updateTransform();
    }, { passive: false });
  }
  
  startDrag(e) {
    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
  }
  
  onDrag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;
    
    this.imageX += deltaX;
    this.imageY += deltaY;
    
    this.startX = e.clientX;
    this.startY = e.clientY;
    
    this.updateTransform();
  }
  
  stopDrag() {
    this.isDragging = false;
  }
  
  crop() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    
    const img = new Image();
    img.onload = () => {
      try {
        // 使用 naturalWidth 或图片实际宽度作为后备
        const naturalW = this.naturalWidth || img.width;
        const naturalH = this.naturalHeight || img.height;
        
        const areaRect = this.area.getBoundingClientRect();
        const scaleRatio = (naturalW * this.scale) / areaRect.width;
        
        const sourceSize = Math.min(img.width, img.height);
        const sourceX = (img.width - sourceSize) / 2 - (this.imageX * scaleRatio);
        const sourceY = (img.height - sourceSize) / 2 - (this.imageY * scaleRatio);
        
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        
        const sx = Math.max(0, sourceX);
        const sy = Math.max(0, sourceY);
        const sw = Math.min(sourceSize, img.width - sx);
        const sh = Math.min(sourceSize, img.height - sy);
        
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
        
        const result = canvas.toDataURL('image/png');
        this.onComplete(result);
        this.close();
      } catch (err) {
        console.error('[AvatarCropper] crop error:', err);
        // 裁剪失败时，仍然调用回调传递原始图片
        try {
          const fallbackCanvas = document.createElement('canvas');
          fallbackCanvas.width = 256;
          fallbackCanvas.height = 256;
          const fallbackCtx = fallbackCanvas.getContext('2d');
          fallbackCtx.fillStyle = '#6D5EF6';
          fallbackCtx.fillRect(0, 0, 256, 256);
          const fallbackResult = fallbackCanvas.toDataURL('image/png');
          this.onComplete(fallbackResult);
        } catch (e) {
          console.error('[AvatarCropper] fallback also failed:', e);
        }
        this.close();
      }
    };
    img.onerror = () => {
      console.error('[AvatarCropper] image load failed');
      // 图片加载失败时，使用颜色头像作为后备
      try {
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 256;
        fallbackCanvas.height = 256;
        const fallbackCtx = fallbackCanvas.getContext('2d');
        fallbackCtx.fillStyle = '#6D5EF6';
        fallbackCtx.fillRect(0, 0, 256, 256);
        const fallbackResult = fallbackCanvas.toDataURL('image/png');
        this.onComplete(fallbackResult);
      } catch (e) {
        console.error('[AvatarCropper] fallback also failed:', e);
      }
      this.close();
    };
    img.src = this.imageSrc;
  }
}

// ============ 6. SchoolSearchSelect 学校联想组件 ============
class SchoolSearchSelect {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options || {};
    this.value = this.options.value || '';
    this.placeholder = this.options.placeholder || '输入或选择学校名称';
    this.schools = OPTIONS.SCHOOL_OPTIONS || [];
    this.onChange = this.options.onChange || (() => {});
    
    this.activeIndex = -1;
    this.init();
  }
  
  init() {
    this.container.classList.add('school-search');
    this.container.innerHTML = `
      <input type="text" 
             class="school-search-input" 
             placeholder="${this.placeholder}" 
             value="${this.value}" />
      <div class="school-search-dropdown">
        <div class="school-search-list"></div>
      </div>
    `;
    
    this.input = this.container.querySelector('.school-search-input');
    this.dropdown = this.container.querySelector('.school-search-dropdown');
    this.list = this.container.querySelector('.school-search-list');
    
    this.input.value = this.value;
    this.bindEvents();
  }
  
  bindEvents() {
    this.input.addEventListener('focus', () => {
      this.showDropdown();
      this.renderList(this.input.value);
    });
    
    this.input.addEventListener('input', (e) => {
      this.value = e.target.value;
      this.activeIndex = -1;
      this.showDropdown();
      this.renderList(this.value);
      this.onChange(this.value);
    });
    
    this.input.addEventListener('keydown', (e) => {
      const items = this.list.querySelectorAll('.school-search-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = Math.min(this.activeIndex + 1, items.length - 1);
        this.updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = Math.max(this.activeIndex - 1, -1);
        this.updateActiveItem();
      } else if (e.key === 'Enter' && this.activeIndex >= 0) {
        e.preventDefault();
        if (items[this.activeIndex]) items[this.activeIndex].click();
      } else if (e.key === 'Escape') {
        this.hideDropdown();
      }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.hideDropdown();
      }
    });
  }
  
  showDropdown() {
    this.dropdown.classList.add('show');
  }
  
  hideDropdown() {
    this.dropdown.classList.remove('show');
  }
  
  renderList(query) {
    const filtered = this.filterSchools(query);
    
    if (filtered.length === 0) {
      this.list.innerHTML = `
        <div class="school-search-no-result">未找到匹配的学校</div>
        <div class="school-search-custom" data-custom="true">
          <i class="fa-solid fa-plus"></i>使用"${query}"作为自定义输入
        </div>
      `;
      
      const customBtn = this.list.querySelector('[data-custom]');
      if (customBtn) {
        customBtn.addEventListener('click', () => {
          this.setValue(query);
          this.hideDropdown();
        });
      }
      return;
    }
    
    // 限制显示数量
    const displayItems = filtered.slice(0, 10);
    
    this.list.innerHTML = displayItems.map((school, i) => {
      const highlight = this.getHighlightedText(school, query);
      
      return `
        <div class="school-search-item ${i === this.activeIndex ? 'active' : ''}" 
             data-school="${school}" 
             data-index="${i}">
          <span>${highlight}</span>
        </div>
      `;
    }).join('');
    
    this.bindItemEvents();
    
    // 如果结果超过10条，显示更多提示
    if (filtered.length > 10) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'school-search-no-result';
      moreDiv.textContent = `还有 ${filtered.length - 10} 条结果，请继续输入以缩小范围`;
      this.list.appendChild(moreDiv);
    }
  }
  
  filterSchools(query) {
    if (!query) return this.schools.slice(0, 15);
    const q = query.toLowerCase();
    return this.schools.filter(s => s.toLowerCase().includes(q));
  }
  
  getHighlightedText(text, query) {
    if (!query) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + `<span class="school-search-item-highlight">${text.slice(idx, idx + query.length)}</span>` + text.slice(idx + query.length);
  }
  
  bindItemEvents() {
    const items = this.list.querySelectorAll('.school-search-item');
    items.forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      
      item.addEventListener('click', () => {
        const school = item.dataset.school;
        this.setValue(school);
        this.hideDropdown();
      });
      
      item.addEventListener('mouseenter', () => {
        this.activeIndex = parseInt(item.dataset.index);
        this.updateActiveItem();
      });
    });
  }
  
  updateActiveItem() {
    const items = this.list.querySelectorAll('.school-search-item');
    items.forEach(item => item.classList.remove('active'));
    if (this.activeIndex >= 0 && items[this.activeIndex]) {
      items[this.activeIndex].classList.add('active');
      items[this.activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  
  setValue(value) {
    this.value = value;
    this.input.value = value;
    this.onChange(value);
  }
  
  getValue() {
    return this.value;
  }
}

// ============ 6.1 MajorSearchSelect 专业联想组件 ============
class MajorSearchSelect {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options || {};
    this.value = this.options.value || '';
    this.placeholder = this.options.placeholder || '输入或选择专业名称';
    this.majors = OPTIONS.MAJOR_OPTIONS || [];
    this.onChange = this.options.onChange || (() => {});
    
    this.activeIndex = -1;
    this.init();
  }
  
  init() {
    this.container.classList.add('school-search');
    this.container.innerHTML = `
      <input type="text" 
             class="school-search-input" 
             placeholder="${this.placeholder}" 
             value="${this.value}" />
      <div class="school-search-dropdown">
        <div class="school-search-list"></div>
      </div>
    `;
    
    this.input = this.container.querySelector('.school-search-input');
    this.dropdown = this.container.querySelector('.school-search-dropdown');
    this.list = this.container.querySelector('.school-search-list');
    
    this.input.value = this.value;
    this.bindEvents();
  }
  
  bindEvents() {
    this.input.addEventListener('focus', () => {
      this.showDropdown();
      this.renderList(this.input.value);
    });
    
    this.input.addEventListener('input', (e) => {
      this.value = e.target.value;
      this.activeIndex = -1;
      this.showDropdown();
      this.renderList(this.value);
      this.onChange(this.value);
    });
    
    this.input.addEventListener('keydown', (e) => {
      const items = this.list.querySelectorAll('.school-search-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.activeIndex = Math.min(this.activeIndex + 1, items.length - 1);
        this.updateActiveItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.activeIndex = Math.max(this.activeIndex - 1, -1);
        this.updateActiveItem();
      } else if (e.key === 'Enter' && this.activeIndex >= 0) {
        e.preventDefault();
        if (items[this.activeIndex]) items[this.activeIndex].click();
      } else if (e.key === 'Escape') {
        this.hideDropdown();
      }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.hideDropdown();
      }
    });
  }
  
  showDropdown() {
    this.dropdown.classList.add('show');
  }
  
  hideDropdown() {
    this.dropdown.classList.remove('show');
  }
  
  renderList(query) {
    const filtered = this.filterMajors(query);
    
    if (filtered.length === 0) {
      this.list.innerHTML = `
        <div class="school-search-no-result">未找到匹配的专业</div>
        <div class="school-search-custom" data-custom="true">
          <i class="fa-solid fa-plus"></i>使用"${query}"作为自定义输入
        </div>
      `;
      
      const customBtn = this.list.querySelector('[data-custom]');
      if (customBtn) {
        customBtn.addEventListener('click', () => {
          this.setValue(query);
          this.hideDropdown();
        });
      }
      return;
    }
    
    // 限制显示数量
    const displayItems = filtered.slice(0, 10);
    
    this.list.innerHTML = displayItems.map((major, i) => {
      const highlight = this.getHighlightedText(major, query);
      
      return `
        <div class="school-search-item ${i === this.activeIndex ? 'active' : ''}" 
             data-major="${major}" 
             data-index="${i}">
          <span>${highlight}</span>
        </div>
      `;
    }).join('');
    
    this.bindItemEvents();
    
    // 如果结果超过10条，显示更多提示
    if (filtered.length > 10) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'school-search-no-result';
      moreDiv.textContent = `还有 ${filtered.length - 10} 条结果，请继续输入以缩小范围`;
      this.list.appendChild(moreDiv);
    }
  }
  
  filterMajors(query) {
    if (!query) return this.majors.slice(0, 15);
    const q = query.toLowerCase();
    return this.majors.filter(m => m.toLowerCase().includes(q));
  }
  
  getHighlightedText(text, query) {
    if (!query) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0, idx) + `<span class="school-search-item-highlight">${text.slice(idx, idx + query.length)}</span>` + text.slice(idx + query.length);
  }
  
  bindItemEvents() {
    const items = this.list.querySelectorAll('.school-search-item');
    items.forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      
      item.addEventListener('click', () => {
        const major = item.dataset.major;
        this.setValue(major);
        this.hideDropdown();
      });
      
      item.addEventListener('mouseenter', () => {
        this.activeIndex = parseInt(item.dataset.index);
        this.updateActiveItem();
      });
    });
  }
  
  updateActiveItem() {
    const items = this.list.querySelectorAll('.school-search-item');
    items.forEach(item => item.classList.remove('active'));
    if (this.activeIndex >= 0 && items[this.activeIndex]) {
      items[this.activeIndex].classList.add('active');
      items[this.activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  
  setValue(value) {
    this.value = value;
    this.input.value = value;
    this.onChange(value);
  }
  
  getValue() {
    return this.value;
  }
}

// ============ 7. TagSelector 标签选择器 ============
class TagSelector {
  constructor(container, options) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    this.options = options || {};
    this.selectedTags = this.options.selectedTags || [];
    this.availableTags = OPTIONS.INTEREST_TAGS || [];
    this.onChange = this.options.onChange || (() => {});
    this.trigger = this.options.trigger || null;
    
    this.init();
  }
  
  init() {
    this.container.innerHTML = `
      <div class="tag-selector-trigger">
        ${this.selectedTags.map(tag => `
          <span class="chip selected tag-item" data-tag="${tag}">
            ${tag}
            <span class="remove-tag" data-remove="${tag}">✕</span>
          </span>
        `).join('')}
        <span class="chip tag-add-btn" id="tag-add-btn">
          <i class="fa-solid fa-plus"></i>添加
        </span>
      </div>
    `;
    
    this.addBtn = this.container.querySelector('#tag-add-btn');
    this.renderTags();
    this.bindEvents();
  }
  
  renderTags() {
    // 移除除了添加按钮之外的标签
    const trigger = this.container.querySelector('.tag-selector-trigger');
    const addBtn = trigger.querySelector('#tag-add-btn');
    trigger.innerHTML = '';
    
    this.selectedTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'chip selected tag-item';
      chip.innerHTML = `${tag} <span class="remove-tag" data-remove="${tag}">✕</span>`;
      chip.querySelector('.remove-tag').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeTag(tag);
      });
      trigger.appendChild(chip);
    });
    
    trigger.appendChild(this.addBtn);
  }
  
  bindEvents() {
    this.addBtn.addEventListener('click', () => this.openPanel());
  }
  
  openPanel() {
    const panel = document.createElement('div');
    panel.className = 'tag-selector-panel';
    panel.innerHTML = `
      <div class="tag-selector-container">
        <div class="tag-selector-header">
          <div class="tag-selector-title">选择兴趣标签</div>
          <div class="tag-selector-close"><i class="fa-solid fa-xmark"></i></div>
        </div>
        <input type="text" class="tag-selector-search" placeholder="搜索标签..." />
        <div class="tag-selector-list"></div>
        <div class="tag-selector-footer">
          <span class="tag-selector-count">已选 ${this.selectedTags.length} 个标签</span>
          <button type="button" class="btn-primary px-4 py-2 rounded-lg text-sm" data-action="done">完成</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    this.panel = panel;
    this.searchInput = panel.querySelector('.tag-selector-search');
    this.listEl = panel.querySelector('.tag-selector-list');
    this.countEl = panel.querySelector('.tag-selector-count');
    
    this.renderTagList('');
    
    this.searchInput.addEventListener('input', (e) => {
      this.renderTagList(e.target.value);
    });
    
    panel.querySelectorAll('.tag-selector-close, [data-action="done"]').forEach(btn => {
      btn.addEventListener('click', () => this.closePanel());
    });
    
    panel.addEventListener('click', (e) => {
      if (e.target === panel) this.closePanel();
    });
  }
  
  renderTagList(filter) {
    const tags = this.availableTags.filter(tag => {
      if (!filter) return true;
      return tag.toLowerCase().includes(filter.toLowerCase());
    });
    
    this.listEl.innerHTML = tags.map(tag => {
      const selected = this.selectedTags.includes(tag);
      return `<span class="tag-selector-item ${selected ? 'selected' : ''}" data-tag="${tag}">${selected ? '✓ ' : ''}${tag}</span>`;
    }).join('');
    
    this.listEl.querySelectorAll('.tag-selector-item').forEach(item => {
      item.addEventListener('click', () => {
        const tag = item.dataset.tag;
        if (this.selectedTags.includes(tag)) {
          this.selectedTags = this.selectedTags.filter(t => t !== tag);
        } else {
          this.selectedTags.push(tag);
        }
        this.renderTagList(this.searchInput.value);
        this.updateCount();
      });
    });
    
    this.updateCount();
  }
  
  updateCount() {
    if (this.countEl) {
      this.countEl.textContent = `已选 ${this.selectedTags.length} 个标签`;
    }
  }
  
  closePanel() {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    this.renderTags();
    this.onChange(this.selectedTags);
  }
  
  removeTag(tag) {
    this.selectedTags = this.selectedTags.filter(t => t !== tag);
    this.renderTags();
    this.onChange(this.selectedTags);
  }
  
  getSelectedTags() {
    return this.selectedTags;
  }
}

// ============ 8. 注册表单校验 ============
const FormValidator = {
  validateNickname(value) {
    if (!value || !value.trim()) return { valid: false, message: '请输入昵称' };
    if (value.length < 2) return { valid: false, message: '昵称至少2个字符' };
    if (value.length > 12) return { valid: false, message: '昵称最多12个字符' };
    if (/[^\u4e00-\u9fa5a-zA-Z0-9_\s]/.test(value)) return { valid: false, message: '昵称不能包含特殊符号' };
    return { valid: true, message: '✓ 可用' };
  },
  
  validateEmail(value) {
    if (!value || !value.trim()) return { valid: false, message: '请输入邮箱' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return { valid: false, message: '邮箱格式不正确' };
    return { valid: true, message: '✓ 邮箱格式正确' };
  },
  
  validatePassword(value) {
    if (!value) return { valid: false, message: '请设置密码', strength: 0 };
    if (value.length < 6) return { valid: false, message: '密码至少6位', strength: 0 };
    
    const strength = this.calculateStrength(value);
    const messages = ['弱', '中', '强'];
    return { valid: true, message: `密码强度：${messages[strength - 1]}`, strength };
  },
  
  calculateStrength(password) {
    let score = 0;
    if (password.length >= 6) score = 1;
    if (password.length >= 8) score = 2;
    
    const types = [/[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[^a-zA-Z0-9]/.test(password)].filter(Boolean).length;
    
    if (types >= 3) score = Math.max(score, 3);
    
    return Math.min(score, 3);
  }
};

// ============ 导出到全局 ============
window.UnifiedSelect = UnifiedSelect;
window.PasswordInput = PasswordInput;
window.AvatarUploader = AvatarUploader;
window.AvatarCropper = AvatarCropper;
window.SchoolSearchSelect = SchoolSearchSelect;
window.MajorSearchSelect = MajorSearchSelect;
window.DefaultAvatar = DefaultAvatar;
window.TagSelector = TagSelector;
window.FormValidator = FormValidator;
