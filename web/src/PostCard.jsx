import { useState, useMemo } from 'react'
import { Facebook, ExternalLink, ChevronDown, ChevronUp, Calendar, MapPin, Building2, Bookmark, Clock } from 'lucide-react'

// Hàm phân tích văn bản để lấy thông tin
function parsePostInfo(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let eventName = ''
  let time = ''
  let location = ''
  
  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase()
    
    // Tên chương trình
    if (!eventName && (lowerLine.includes('tên chương trình') || lowerLine.includes('chủ đề') || lowerLine.includes('tên hoạt động'))) {
      eventName = lines[i].replace(/^(.*?)(tên chương trình|chủ đề|tên hoạt động)([:\s-]*)/i, '').trim()
      // Nếu dòng này chỉ có chữ "Thời gian:" và nội dung nằm ở dòng dưới
      if (!eventName && i + 1 < lines.length) eventName = lines[i+1].trim()
    }
    
    // Thời gian
    if (!time && (lowerLine.includes('thời gian') || lowerLine.includes('thời hạn') || lowerLine.includes('deadline') || lowerLine.includes('lúc'))) {
      time = lines[i].replace(/^(.*?)(thời gian|thời hạn|deadline|lúc)([:\s-]*)/i, '').trim()
      if (!time && i + 1 < lines.length) time = lines[i+1].trim()
    }
    
    // Địa điểm / hình thức
    if (!location && (lowerLine.includes('địa điểm') || lowerLine.includes('hình thức') || lowerLine.includes('nền tảng'))) {
      location = lines[i].replace(/^(.*?)(địa điểm|hình thức|nền tảng)([:\s-]*)/i, '').trim()
      if (!location && i + 1 < lines.length) location = lines[i+1].trim()
    }
  }
  
  // Fallback cho Tên chương trình nếu không tìm thấy từ khóa
  if (!eventName && lines.length > 0) {
    // Nếu dòng đầu tiên viết Hoa toàn bộ, hoặc có độ dài vừa phải
    if (lines[0].toUpperCase() === lines[0] && lines[0].length > 10) {
      eventName = lines[0]
    } else {
      eventName = "Thông báo hoạt động / Sự kiện mới"
    }
  }

  // Fallback làm sạch độ dài
  if (eventName.length > 100) eventName = eventName.substring(0, 100) + '...'
  if (time.length > 80) time = time.substring(0, 80) + '...'
  if (location.length > 80) location = location.substring(0, 80) + '...'

  return { 
    eventName: eventName || 'Chưa xác định', 
    time: time || 'Chưa xác định (Xem chi tiết trong bài)', 
    location: location || 'Chưa xác định (Xem chi tiết trong bài)' 
  }
}

function PostCard({ post, index }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const animationDelay = `${(index % 10) * 0.1}s`
  const toggleExpand = () => setIsExpanded(!isExpanded)

  // Trích xuất dữ liệu
  const { eventName, time, location } = useMemo(() => parsePostInfo(post.text), [post.text])
  
  const isLongText = post.text && post.text.length > 250

  return (
    <article className="post-card" style={{ animationDelay }}>
      <div className="card-top-accent"></div>
      
      {/* Tên chương trình */}
      <h2 className="event-title">
        <Bookmark className="title-icon" size={22} />
        {eventName}
      </h2>

      <div className="info-list">
        {/* Đơn vị tổ chức */}
        <div className="info-item">
          <div className="info-icon-wrapper organizer-icon">
            <Building2 size={18} />
          </div>
          <div className="info-content">
            <span className="info-label">Đơn vị tổ chức</span>
            <span className="info-value text-glow">{post.page || 'Không rõ trang'}</span>
          </div>
        </div>

        {/* Thời gian */}
        <div className="info-item">
          <div className="info-icon-wrapper time-icon">
            <Clock size={18} />
          </div>
          <div className="info-content">
            <span className="info-label">Thời gian & Hạn chót</span>
            <span className="info-value">{time}</span>
          </div>
        </div>

        {/* Địa điểm / Hình thức */}
        <div className="info-item">
          <div className="info-icon-wrapper location-icon">
            <MapPin size={18} />
          </div>
          <div className="info-content">
            <span className="info-label">Hình thức hoạt động</span>
            <span className="info-value">{location}</span>
          </div>
        </div>
      </div>
      
      {/* Chi tiết nguyên bản */}
      <div className="raw-content-wrapper">
        <div className="raw-content-header" onClick={toggleExpand}>
          <span>{isExpanded ? 'Ẩn chi tiết bài viết' : 'Đọc chi tiết nguyên văn'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
        
        {isExpanded && (
          <div className="post-content">
            {post.text}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
        <a 
          href={post.link} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="action-button"
        >
          Mở bài viết trên Facebook
          <Facebook size={18} className="btn-icon" />
        </a>
      </div>
    </article>
  )
}

export default PostCard
