import { useState, useMemo } from 'react'
import { Search, GraduationCap } from 'lucide-react'
import PostCard from './PostCard'
// Import file json trực tiếp trong thư mục web/src
// Vite sẽ bundle nội dung file này vào bundle JS ở lúc build
import postsData from './matched_posts.json'

function App() {
  const [searchTerm, setSearchTerm] = useState('')

  // Đảm bảo data là một mảng
  const posts = Array.isArray(postsData) ? postsData : []

  // Lọc bài viết
  const filteredPosts = useMemo(() => {
    if (!searchTerm.trim()) return posts

    const lowerTerm = searchTerm.toLowerCase()
    return posts.filter(post => 
      (post.page && post.page.toLowerCase().includes(lowerTerm)) || 
      (post.text && post.text.toLowerCase().includes(lowerTerm))
    )
  }, [posts, searchTerm])

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <GraduationCap style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }} size={40} />
          Điểm Rèn Luyện
        </h1>
        <p>Cập nhật tự động thông tin điểm rèn luyện mới nhất từ các Fanpage</p>

        <div className="search-container">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Tìm kiếm theo tên Fanpage hoặc nội dung bài viết..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="search-icon" size={20} />
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
            <p>Không tìm thấy bài viết nào phù hợp với "{searchTerm}"</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
