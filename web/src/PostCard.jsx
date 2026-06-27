import { useState } from 'react'
import { Facebook, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

function PostCard({ post, index }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Tính toán delay cho animation
  const animationDelay = `${(index % 10) * 0.1}s`

  const toggleExpand = () => setIsExpanded(!isExpanded)

  // Kiểm tra xem bài có dài quá 250 ký tự không để hiện nút Xem thêm
  const isLongText = post.text && post.text.length > 250

  return (
    <article className="post-card" style={{ animationDelay }}>
      <div className="post-header">
        <div className="page-icon">
          <Facebook size={24} />
        </div>
        <div className="page-name">{post.page || 'Không rõ trang'}</div>
      </div>
      
      <div className={`post-content ${!isExpanded && isLongText ? 'truncated' : ''}`}>
        {post.text}
      </div>
      
      {isLongText && (
        <button className="read-more-btn" onClick={toggleExpand}>
          {isExpanded ? (
            <><ChevronUp size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> Thu gọn</>
          ) : (
            <><ChevronDown size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }}/> Xem thêm</>
          )}
        </button>
      )}

      <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
        <a 
          href={post.link} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="action-button"
        >
          Xem bài viết gốc
          <ExternalLink size={18} className="btn-icon" />
        </a>
      </div>
    </article>
  )
}

export default PostCard
