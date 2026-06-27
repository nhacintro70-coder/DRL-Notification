import { useState, useMemo } from 'react'
import { GraduationCap, Filter } from 'lucide-react'
import PostCard from './PostCard'
// Import file json trực tiếp trong thư mục web/src
// Vite sẽ bundle nội dung file này vào bundle JS ở lúc build
import postsData from './matched_posts.json'

function App() {
  const [selectedPage, setSelectedPage] = useState('Tất cả')

  // Đảm bảo data là một mảng
  const posts = Array.isArray(postsData) ? postsData : []

  // Trích xuất danh sách Fanpage độc nhất để làm bộ lọc
  const uniquePages = useMemo(() => {
    const pages = new Set()
    posts.forEach(post => {
      if (post.page) pages.add(post.page)
    })
    return ['Tất cả', ...Array.from(pages)]
  }, [posts])

  // Lọc bài viết theo Fanpage
  const filteredPosts = useMemo(() => {
    if (selectedPage === 'Tất cả') return posts
    return posts.filter(post => post.page === selectedPage)
  }, [posts, selectedPage])

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <GraduationCap style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }} size={40} />
          Điểm Rèn Luyện
        </h1>
        <p>Cập nhật tự động thông tin điểm rèn luyện mới nhất từ các Fanpage</p>

        {/* Bộ lọc Fanpage */}
        <div className="filter-container">
          <div className="filter-title">
            <Filter size={18} />
            <span>Lọc theo Đơn vị tổ chức:</span>
          </div>
          <div className="filter-chips">
            {uniquePages.map((page, index) => (
              <button
                key={index}
                className={`filter-chip ${selectedPage === page ? 'active' : ''}`}
                onClick={() => setSelectedPage(page)}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main>
        {filteredPosts.length > 0 ? (
          <div className="post-grid">
            {filteredPosts.map((post, index) => (
              <PostCard 
                key={`${post.link}-${index}`} 
                post={post} 
                index={index} 
              />
            ))}
          </div>
        ) : (
          <div className="no-results">
            <p>Không có bài viết nào từ đơn vị này.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
