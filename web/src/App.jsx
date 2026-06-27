import { useState, useMemo } from 'react'
import { GraduationCap, Filter, FolderTree } from 'lucide-react'
import PostCard from './PostCard'
import postsData from './matched_posts.json'

const CATEGORIES = [
  {
    name: "Hệ thống Đoàn – Hội Cơ sở",
    pages: [
      "Đoàn - Hội khoa Công nghệ thông tin kinh doanh",
      "Đoàn - Hội khoa Du lịch",
      "Đoàn - Hội khoa Kế toán",
      "Đoàn - Hội khoa Kinh doanh quốc tế - Marketing",
      "Đoàn - Hội khoa Kinh tế",
      "Đoàn - Hội Khoa Luật UEH",
      "Đoàn - Hội khoa Ngân hàng UEH",
      "Đoàn - Hội Khoa Ngoại Ngữ UEH",
      "Đoàn Khoa Quản Lý Nhà Nước - UEH",
      "Đoàn Hội Quản trị UEH",
      "Khoa Tài chính - UEH",
      "Đoàn - Hội Khoa Tài chính",
      "Đoàn - Hội Khoa Toán - Thống Kê UEH",
      "Đoàn - Hội Liên viện CTD",
      "Đoàn - Hội viện Khoa học chính trị - xã hội UEH"
    ]
  },
  {
    name: "Các Câu lạc bộ Cấp Khoa Tiêu Biểu",
    pages: [
      "CLB Kế Toán - Kiểm toán A2C",
      "International Business Club",
      "Margroup (Nhóm sinh viên nghiên cứu marketing)",
      "TaxGroup - Nhóm Sinh Viên Nghiên Cứu Thuế",
      "CLB Chứng Khoán SCUE",
      "CLB Bất động sản REC",
      "Câu lạc bộ Công nghệ Kinh tế - ET Club",
      "CLB PHÁP LÝ",
      "HuReA Club"
    ]
  },
  {
    name: "Các Câu lạc bộ, Đội và Nhóm Cấp UEH",
    pages: [
      "CFE - CLB Tiếng Pháp UEH",
      "BELL UEH",
      "CLB Guitar Đại Học Kinh Tế TP.HCM (UEHG)",
      "CLB Tư Duy Phản Biện UEH - CTC",
      "CLB Sinh viên Khởi nghiệp - Dynamic UEH",
      "UEH Volleyball Club",
      "Đội Văn Nghệ Xung Kích UEH",
      "Đội Cộng Tác Viên UEH",
      "CLB Chuyện To Nhỏ",
      "Clb Giai Điệu Trẻ",
      "CLB Võ Thuật ĐH Kinh Tế",
      "CLB DÂN CA UEH",
      "Đội Công tác xã hội Đại học Kinh tế TP. Hồ Chí Minh",
      "S Communications (Nhóm truyền thông sinh viên)",
      "CLB Nhân sự - Khởi nghiệp",
      "CLB Thương Mại",
      "CLB Lý Luận Trẻ UEH",
      "Travelgroup UEH",
      "APPLE Club - UEH",
      "SSG - Hỗ Trợ Sinh Viên",
      "Câu lạc bộ Nghiên cứu Kinh tế Trẻ YoRE",
      "Youth UEH Community"
    ]
  }
]

function App() {
  const [selectedPage, setSelectedPage] = useState('Tất cả')

  const posts = Array.isArray(postsData) ? postsData : []

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

        {/* Bộ lọc Fanpage theo nhóm */}
        <div className="filter-container">
          <div className="filter-title">
            <Filter size={18} />
            <span>Lọc theo Đơn vị tổ chức:</span>
          </div>
          
          <div className="filter-all-wrapper">
            <button
              className={`filter-chip ${selectedPage === 'Tất cả' ? 'active' : ''}`}
              onClick={() => setSelectedPage('Tất cả')}
            >
              Hiển thị Tất cả
            </button>
          </div>

          <div className="filter-groups">
            {CATEGORIES.map((category, idx) => (
              <div key={idx} className="filter-group">
                <h3 className="filter-group-title">
                  <FolderTree size={16} />
                  {category.name}
                </h3>
                <div className="filter-chips">
                  {category.pages.map((page, index) => {
                    const postCount = posts.filter(p => p.page === page).length;
                    return (
                      <button
                        key={index}
                        className={`filter-chip ${selectedPage === page ? 'active' : ''} ${postCount === 0 && selectedPage !== page ? 'inactive-chip' : ''}`}
                        onClick={() => setSelectedPage(page)}
                        title={postCount === 0 ? "Hiện chưa có bài viết mới" : `${postCount} bài viết`}
                      >
                        {page}
                        {postCount > 0 && <span className="chip-badge">{postCount}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
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
            <p>Hiện tại không có thông báo điểm rèn luyện nào từ <strong>{selectedPage}</strong>.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
