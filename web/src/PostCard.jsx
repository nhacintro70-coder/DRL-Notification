import { useState, useMemo } from 'react'
import { Facebook, ExternalLink, ChevronDown, ChevronUp, Calendar, MapPin, Building2, Bookmark, Clock } from 'lucide-react'

function parsePostInfo(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let eventName = ''
  let time = ''
  let location = ''
  
  const lowerText = text.toLowerCase();
  
  // Các từ khóa đánh dấu bắt đầu một mục mới
  const sectionKeywords = [
    'địa điểm', 'đối tượng', 'thể lệ', 'link', 'lưu ý', 'chú ý', 
    'quyền lợi', 'yêu cầu', 'cách thức', 'thông tin chi tiết', 
    'thời gian', 'hạn chót', 'deadline', 'thông tin liên hệ', 'liên hệ'
  ];

  // Hàm hỗ trợ cắt nội dung của một mục
  const extractSection = (keywords) => {
    let bestIdx = -1;
    let foundKw = '';
    for (let kw of keywords) {
      const idx = lowerText.indexOf(kw);
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        foundKw = kw;
      }
    }
    
    if (bestIdx === -1) return '';
    
    // Lấy chuỗi sau từ khóa
    let subStr = text.substring(bestIdx + foundKw.length).replace(/^[:\s\-]+/, '');
    
    let endIdx = subStr.length;
    let nextSectionIdx = -1;
    const lowerSubStr = subStr.toLowerCase();
    
    // Tìm từ khóa của mục tiếp theo để cắt
    for (let kw of sectionKeywords) {
      if (keywords.includes(kw)) continue; 
      
      const idx = lowerSubStr.indexOf(kw);
      if (idx !== -1) {
          const beforeKw = lowerSubStr.substring(Math.max(0, idx - 5), idx);
          // Chỉ cắt nếu từ khóa mục tiếp theo nằm ở đầu dòng hoặc sau dấu chấm
          if (beforeKw.includes('\n') || beforeKw.includes('.') || nextSectionIdx === -1) {
              if (nextSectionIdx === -1 || idx < nextSectionIdx) {
                  nextSectionIdx = idx;
              }
          }
      }
    }
    
    if (nextSectionIdx !== -1) {
      endIdx = nextSectionIdx;
    } else {
      // Nếu không có từ khóa tiếp theo, cắt ở dấu xuống dòng nếu đã lấy đủ dài
      const newlineIdx = subStr.indexOf('\n');
      if (newlineIdx !== -1 && newlineIdx > 10) {
        endIdx = newlineIdx;
      }
    }
    
    return subStr.substring(0, endIdx).trim();
  };

  // 1. TÌM THỜI GIAN
  time = extractSection(['thời gian', 'thời hạn', 'deadline', 'hạn chót', 'timeline']);
  
  if (time) {
    // Tinh chỉnh Thời gian bằng Regex để lấy đúng ngày/giờ, loại bỏ câu chữ rườm rà
    const timeRegex = /((?:\d{1,2}h\d{0,2}|\d{1,2}:\d{2})|(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)|(?:ngày\s*\d{1,2})|(?:tháng\s*\d{1,2})|(?:năm\s*\d{2,4})|(?:thứ\s*\d)|(?:chủ nhật))/gi;
    const matches = time.match(timeRegex);
    if (matches && matches.length > 0) {
      const firstMatchIdx = time.indexOf(matches[0]);
      const lastMatch = matches[matches.length - 1];
      const lastMatchIdx = time.lastIndexOf(lastMatch) + lastMatch.length;
      time = time.substring(firstMatchIdx, lastMatchIdx);
    }
  }

  // 2. TÌM ĐỊA ĐIỂM
  location = extractSection(['địa điểm', 'hình thức', 'nền tảng']);
  if (location) {
    const locLower = location.toLowerCase();
    if (locLower.includes("online") || locLower.includes("zoom") || locLower.includes("microsoft teams") || locLower.includes("meet")) {
      location = "Online";
    } else {
      // Xóa dấu cộng/trừ đầu dòng
      location = location.replace(/^[\+\-\*]\s*/g, '').trim();
    }
  }

  // 3. TÌM TÊN CHƯƠNG TRÌNH (Tiêu đề)
  let foundTitle = '';
  
  // Ưu tiên 1: Lấy dòng có chứa ngoặc vuông [...] trong 5 dòng đầu
  for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.includes('[') && line.includes(']')) {
          foundTitle = line;
          // Nếu dòng này quá ngắn (ví dụ chỉ chứa "[HTTT]"), lấy thêm dòng dưới
          if (line.length < 30 && i + 1 < lines.length) {
              foundTitle += ' ' + lines[i+1];
          }
          break;
      }
  }
  
  // Ưu tiên 2: Lấy đoạn văn bản trước dãy vạch ngang phân cách (---------)
  if (!foundTitle) {
      const sepIdx = text.search(/[-=_]{5,}/);
      if (sepIdx > 0 && sepIdx < 300) {
          const topText = text.substring(0, sepIdx).trim();
          foundTitle = topText.split('\n').map(l => l.trim()).filter(l => l).join(' ');
      }
  }
  
  // Ưu tiên 3: Lấy dòng đầu tiên (hoặc 2 dòng nếu quá ngắn)
  if (!foundTitle && lines.length > 0) {
      foundTitle = lines[0];
      if (foundTitle.length < 50 && lines.length > 1) {
          foundTitle += ' - ' + lines[1];
      }
  }

  eventName = foundTitle;

  // Rút gọn nếu quá dài
  if (eventName.length > 120) eventName = eventName.substring(0, 120) + '...';
  if (time.length > 80) time = time.substring(0, 80) + '...';
  if (location.length > 80) location = location.substring(0, 80) + '...';

  // Viết hoa chữ cái đầu
  if (location) location = location.charAt(0).toUpperCase() + location.slice(1);
  if (time) time = time.charAt(0).toUpperCase() + time.slice(1);

  return { 
    eventName: eventName || 'Thông báo hoạt động / Sự kiện mới', 
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
