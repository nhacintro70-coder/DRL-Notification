import { useState, useMemo, useRef, useEffect } from 'react'
import { GraduationCap, Filter, ChevronDown, X } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState('Tất cả')
  const [activeClub, setActiveClub] = useState(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  
  const panelRef = useRef(null)

  // Đóng panel khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsPanelOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const posts = Array.isArray(postsData) ? postsData : []

  // Logic đổi tab
  const handleSelectTab = (tabName) => {
    setActiveTab(tabName)
    setActiveClub(null) // Đổi tab thì reset club
    setIsPanelOpen(false)
  }

  // Logic chọn club
  const handleSelectClub = (clubName) => {
    setActiveClub(clubName)
    setIsPanelOpen(false)
  }

  // Lấy ra object Category hiện tại dựa trên activeTab
  const currentCategoryObj = CATEGORIES.find(c => c.name === activeTab)

  // Lọc dữ liệu kết quả cuối cùng
  const filteredPosts = useMemo(() => {
    if (activeTab === 'Tất cả') {
      return posts
    }
    if (activeClub) {
      // Đã chọn một CLB cụ thể trong nhóm
      return posts.filter(post => post.page === activeClub)
    }
    // Đã chọn một nhóm nhưng chưa chọn CLB cụ thể -> Hiện toàn bộ bài trong nhóm đó
    return posts.filter(post => currentCategoryObj?.pages.includes(post.page))
  }, [posts, activeTab, activeClub, currentCategoryObj])


  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <GraduationCap style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }} size={40} />
          Điểm Rèn Luyện
        </h1>
        <p>Cập nhật tự động thông tin điểm rèn luyện mới nhất từ các Fanpage</p>

        {/* Khu vực Filter 2 Tầng */}
        <div className="filter-system">
          
          {/* Tầng 1: Tab Chips */}
          <div className="tab-chips-wrap">
            <button 
              className={`tab-chip ${activeTab === 'Tất cả' ? 'active' : ''}`}
              onClick={() => handleSelectTab('Tất cả')}
            >
              Tất cả
            </button>
            {CATEGORIES.map((cat, idx) => (
              <button 
                key={idx}
                className={`tab-chip ${activeTab === cat.name ? 'active' : ''}`}
                onClick={() => handleSelectTab(cat.name)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Tầng 2: Nút Lọc chi tiết & Floating Panel */}
          {activeTab !== 'Tất cả' && (
            <div className="level-2-filter">
              
              {!activeClub ? (
                // Nếu chưa chọn CLB, hiện nút sổ xuống
                <div className="filter-trigger-wrap" ref={panelRef}>
                  <button 
                    className="detail-filter-btn"
                    onClick={() => setIsPanelOpen(!isPanelOpen)}
                  >
                    Lọc chi tiết <ChevronDown size={14} />
                  </button>

                  {/* Floating Panel (Absolute) */}
                  {isPanelOpen && currentCategoryObj && (
                    <div className="floating-panel">
                      <div className="panel-title">Chọn Đơn vị cụ thể:</div>
                      <div className="panel-clubs">
                        {currentCategoryObj.pages.map((page, idx) => {
                          const postCount = posts.filter(p => p.page === page).length;
                          return (
                            <button
                              key={idx}
                              className={`panel-club-item ${postCount === 0 ? 'inactive' : ''}`}
                              onClick={() => handleSelectClub(page)}
                            >
                              {page} {postCount > 0 && <span>({postCount})</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Nếu ĐÃ chọn CLB, hiện Badge có nút tắt (X)
                <span className="active-badge">
                  {activeClub}
                  <button onClick={() => setActiveClub(null)} title="Bỏ lọc CLB này">
                    <X size={14} />
                  </button>
                </span>
              )}

            </div>
          )}

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
            <p>Hiện tại không có thông báo điểm rèn luyện nào phù hợp.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
