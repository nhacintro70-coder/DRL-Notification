import { useState, useMemo } from 'react'
import { Facebook, ExternalLink, ChevronDown, ChevronUp, Calendar, MapPin, Building2, Bookmark, Clock } from 'lucide-react'

export function parsePostInfo(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  
  let eventName = ''
  let time = ''
  let location = ''
  
  const lowerText = text.toLowerCase();
  
  // Các từ khóa đánh dấu bắt đầu một mục mới
  const sectionKeywords = [
    'địa điểm', 'đối tượng', 'thể lệ', 'link', 'lưu ý', 'chú ý', 
    'quyền lợi', 'yêu cầu', 'cách thức', 'thông tin chi tiết', 
    'thời gian', 'hạn chót', 'deadline', 'thông tin liên hệ', 'liên hệ', 'diễn giả', 'khách mời', 'host'
  ];

  // Hàm hỗ trợ cắt nội dung của một mục
  const extractSection = (keywords, includeKeyword = false, validationRegex = null) => {
    // Tìm tất cả các vị trí xuất hiện của các từ khóa
    let occurrences = [];
    for (let kw of keywords) {
      let startIndex = 0;
      let idx;
      while ((idx = lowerText.indexOf(kw, startIndex)) > -1) {
        occurrences.push({ index: idx, kw: kw });
        startIndex = idx + kw.length;
      }
    }
    
    // Sắp xếp theo vị trí xuất hiện từ trên xuống dưới
    occurrences.sort((a, b) => a.index - b.index);
    
    for (let occ of occurrences) {
      const bestIdx = occ.index;
      const foundKw = occ.kw;
      
      // Lấy chuỗi
      let startIdx = includeKeyword ? bestIdx : (bestIdx + foundKw.length);
      let subStr = text.substring(startIdx);
      if (!includeKeyword) subStr = subStr.replace(/^[:\s\-]+/, '');
      
      let endIdx = subStr.length;
      let nextSectionIdx = -1;
      const lowerSubStr = subStr.toLowerCase();
      
      // Tìm từ khóa của mục tiếp theo để cắt
      for (let kw of sectionKeywords) {
        if (keywords.includes(kw)) continue; 
        
        const idx = lowerSubStr.indexOf(kw);
        if (idx !== -1 && (!includeKeyword || idx > foundKw.length)) {
            const beforeKw = lowerSubStr.substring(Math.max(0, idx - 5), idx);
            // Chỉ cắt nếu từ khóa mục tiếp theo nằm ở đầu dòng hoặc sau dấu chấm/phẩy/gạch
            if (/[\n\.\,\-\|]/.test(beforeKw) || nextSectionIdx === -1) {
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
        const minLength = includeKeyword ? (foundKw.length + 10) : 10;
        const newlineIdx = subStr.indexOf('\n', includeKeyword ? foundKw.length : 0);
        if (newlineIdx !== -1 && newlineIdx > minLength) {
          endIdx = newlineIdx;
        }
      }
      
      let result = subStr.substring(0, endIdx).trim();
      // Xóa những dòng phân cách thừa (---, ===, ___)
      const sepMatch = result.match(/[-=_]{3,}/);
      if (sepMatch) {
         result = result.substring(0, sepMatch.index).trim();
      }
      
      // Nếu có regex kiểm chứng, đoạn cắt được PHẢI thỏa mãn regex, nếu không sẽ bỏ qua và tìm tiếp
      if (validationRegex) {
        if (validationRegex.test(result)) {
           return result;
        }
      } else {
        return result;
      }
    }
    
    return '';
  };

  // 1. TÌM THỜI GIAN ĐĂNG KÝ / HẠN CHÓT
  // Bắt buộc đoạn lấy được phải có chứa ngày tháng hoặc giờ NẰM TRONG 120 KÝ TỰ ĐẦU TIÊN
  const hasTimeRegex = /^[\s\S]{0,120}(?:\d{1,2}h\d{0,2}|\d{1,2}:\d{2}|\d{1,2}[\/\-]\d{1,2}|ngày\s*\d{1,2})/i;
  time = extractSection(['thời gian đăng ký', 'hạn đăng ký', 'hạn chót', 'deadline', 'thời hạn đăng ký', 'đăng ký:', 'đăng ký từ', 'đóng form'], true, hasTimeRegex);
  
  if (time) {
    const extractTimeRegex = /((?:\d{1,2}h\d{0,2}|\d{1,2}:\d{2})|(?:\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)|(?:ngày\s*\d{1,2})|(?:tháng\s*\d{1,2})|(?:năm\s*\d{2,4})|(?:thứ\s*\w+)|(?:chủ nhật))/gi;
    let matches = [];
    let match;
    while ((match = extractTimeRegex.exec(time)) !== null) {
      matches.push({ text: match[0], index: match.index });
    }
    
    if (matches.length > 0) {
      let lastMatch = matches[matches.length - 1];
      let endOfTime = lastMatch.index + lastMatch.text.length;
      
      // Bắt thêm thứ trong ngoặc nếu có (ví dụ: (Thứ Ba))
      let afterText = time.substring(endOfTime);
      let thuMatch = afterText.match(/^\s*[\(\,\-]?\s*(thứ\s*\w+|chủ nhật)\s*\)?/i);
      if (thuMatch) {
        endOfTime += thuMatch[0].length;
      }
      
      time = time.substring(0, endOfTime).trim();
      // Loại bỏ các ký tự dấu thừa ở cuối (như phẩy, chấm, gạch ngang)
      time = time.replace(/[\,\.\-\_]*$/, '').trim();
    } else {
      time = '';
    }
  }

  // 2. TÌM ĐỊA ĐIỂM (Bao gồm cả lời dẫn)
  location = extractSection(['địa điểm', 'hình thức:', 'hình thức hoạt động', 'hình thức tổ chức', 'nền tảng:'], true);
  if (location) {
    const locLower = location.toLowerCase();
    
    // Bộ lọc kiểm chứng: Phải chứa các từ khóa liên quan đến địa danh hoặc online
    const validLocRegex = /\b(trường|cơ sở|cs|phòng|hội trường|sảnh|đường|quận|phường|xã|ueh|online|zoom|teams|meet|google|trực tuyến|địa chỉ|sân|nhà|tp|hcm|microsoft)\b/i;
    const isValidLoc = validLocRegex.test(locLower);
    
    // Nếu quá dài (> 200 ký tự) mà không bị cắt, có thể là bắt nhầm đoạn văn bản
    if (!isValidLoc || location.length > 200) {
      location = '';
    } else if (locLower.includes("online") || locLower.includes("zoom") || locLower.includes("teams") || locLower.includes("meet") || locLower.includes("trực tuyến")) {
      // Giữ nguyên câu, nhưng nếu dài quá thì cắt tới dấu chấm/phẩy gần nhất (sau chữ online/nền tảng)
      const dotIdx = location.search(/[\.\,]/);
      if (dotIdx !== -1 && dotIdx > 15) location = location.substring(0, dotIdx).trim();
      
      location = location.charAt(0).toUpperCase() + location.slice(1);
    } else {
      // Xóa dấu cộng/trừ đầu dòng
      location = location.replace(/^[\+\-\*]\s*/g, '').trim();
    }
    
    // Xóa các ký tự thừa ở cuối
    if (location) {
      location = location.replace(/[\,\.\-\_]*$/, '').trim();
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
  // Xóa các ký tự gạch ngang/bằng thừa ở cuối tiêu đề
  eventName = eventName.replace(/[\-\=_]+$/, '').trim();
  
  if (time.length > 80) time = time.substring(0, 80) + '...';
  if (location.length > 100) location = location.substring(0, 100) + '...';

  // Viết hoa chữ cái đầu
  if (location) location = location.charAt(0).toUpperCase() + location.slice(1);
  if (time) time = time.charAt(0).toUpperCase() + time.slice(1);

  // 4. TÌM MỤC ĐIỂM RÈN LUYỆN
  let pointCategory = 'Chưa phân loại';
  const directMatch = /(?:mục|tiêu chí)[\s:]*([1-6])/i.exec(text);
  if (directMatch) {
    pointCategory = `Mục ${directMatch[1]}`;
  } else {
    // Heuristic matching
    if (/(cuộc thi|học thuật|nckh|khởi nghiệp|olympic|nghiên cứu khoa học)/i.test(text)) {
      pointCategory = 'Mục 1';
    } else if (/(tình nguyện|mùa hè xanh|hiến máu|ngoài ueh|ngoài trường|cộng đồng)/i.test(text)) {
      pointCategory = 'Mục 4';
    } else if (/(talkshow|hội thảo|chia sẻ|minigame|share bài|văn nghệ|thể thao|giao lưu|workshop|tọa đàm)/i.test(text)) {
      pointCategory = 'Mục 3';
    } else {
      pointCategory = 'Mục 3'; // Mặc định các CLB/Đoàn Hội đăng bài thường rơi vào Mục 3
    }
  }

  return { 
    eventName: eventName || 'Thông báo hoạt động / Sự kiện mới', 
    time: time || '(Xem chi tiết trong bài)', 
    location: location || '(Xem chi tiết trong bài)',
    pointCategory
  }
}

function PostCard({ post, index }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const animationDelay = `${(index % 10) * 0.1}s`
  const toggleExpand = () => setIsExpanded(!isExpanded)

  // Trích xuất dữ liệu
  const { eventName, time, location, pointCategory } = useMemo(() => parsePostInfo(post.text), [post.text])
  
  const getCategoryClass = (cat) => {
    switch(cat) {
      case 'Mục 1': return 'cat-badge-m1';
      case 'Mục 3': return 'cat-badge-m3';
      case 'Mục 4': return 'cat-badge-m4';
      default: return 'cat-badge-default';
    }
  }
  
  const isLongText = post.text && post.text.length > 250

  return (
    <article className="post-card" style={{ animationDelay }}>
      <div className="card-top-accent"></div>
      
      {/* Tên chương trình */}
      <div className="title-area">
        <span className={`point-category-badge ${getCategoryClass(pointCategory)}`}>{pointCategory}</span>
        <h2 className="event-title">
          <Bookmark className="title-icon" size={22} />
          {eventName}
        </h2>
      </div>

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
            <span className="info-value text-glow">
              {time || '(Xem chi tiết trong bài)'}
            </span>
          </div>
        </div>

        {/* Địa điểm / Hình thức */}
        <div className="info-item">
          <div className="info-icon-wrapper location-icon">
            <MapPin size={20} />
          </div>
          <div className="info-content">
            <span className="info-label">Hình thức hoạt động</span>
            <span className="info-value">
              {location || '(Xem chi tiết trong bài)'}
            </span>
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
