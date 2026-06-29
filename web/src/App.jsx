import { useState, useMemo, useRef, useEffect } from 'react'
import { GraduationCap, Filter, ChevronDown, X } from 'lucide-react'
import PostCard, { parsePostInfo } from './PostCard'
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
      "HuReA Club",
      "ASC - Actuarial Science Club (CLB Phân tích rủi ro và Định phí bảo hiểm)"
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
  const [activeClubs, setActiveClubs] = useState([]) // Chuyển thành Array để Multi-select
  const [activePointCategory, setActivePointCategory] = useState('Tất cả Mục')
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  
  const POINT_CATEGORIES = ['Tất cả Mục', 'Mục 1', 'Mục 3', 'Mục 4', 'Chưa phân loại'];
  
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

  const processedPosts = useMemo(() => {
    return (Array.isArray(postsData) ? postsData : []).map(post => {
      const parsed = parsePostInfo(post.text);
      return { ...post, pointCategory: parsed.pointCategory };
    });
  }, []);

  // Logic đổi tab
  const handleSelectTab = (tabName) => {
    setActiveTab(tabName)
    setActiveClubs([]) // Đổi tab thì reset mảng club
    setIsPanelOpen(false)
  }

  // Logic chọn club (Multi-select)
  const handleSelectClub = (clubName) => {
    if (clubName === null) {
      setActiveClubs([]) // Chọn 'Tất cả trong nhóm' -> Xóa hết chọn
    } else {
      setActiveClubs(prev => 
        prev.includes(clubName) 
          ? prev.filter(c => c !== clubName) // Nếu đã chọn thì bỏ chọn
          : [...prev, clubName] // Nếu chưa chọn thì thêm vào
      )
    }
    // Panel KHÔNG tự đóng để user chọn tiếp nhiều cái
  }

  // Lấy ra object Category hiện tại dựa trên activeTab
  const currentCategoryObj = CATEGORIES.find(c => c.name === activeTab)

  // Lọc dữ liệu kết quả cuối cùng
  const filteredPosts = useMemo(() => {
    let result = processedPosts;

    // 1. Lọc theo Mục ĐRL
    if (activePointCategory !== 'Tất cả Mục') {
      result = result.filter(post => post.pointCategory === activePointCategory);
    }

    // 2. Lọc theo Đơn vị tổ chức
    if (activeTab !== 'Tất cả') {
      if (activeClubs.length > 0) {
        // Đã chọn một HOẶC nhiều CLB cụ thể trong nhóm
        result = result.filter(post => activeClubs.includes(post.page))
      } else {
        // Đã chọn một nhóm nhưng chưa chọn CLB cụ thể -> Hiện toàn bộ bài trong nhóm đó
        result = result.filter(post => currentCategoryObj?.pages.includes(post.page))
      }
    }
    
    return result;
  }, [processedPosts, activeTab, activeClubs, currentCategoryObj, activePointCategory])


  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <GraduationCap style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '10px' }} size={40} />
          Điểm Rèn Luyện
        </h1>
        <p>Cập nhật tự động thông tin điểm rèn luyện mới nhất từ các Fanpage</p>

        {/* Khu vực Filter 2 Tầng (Spec v2) */}
        <div className="filter-system">
          
          {/* Lọc theo Mục ĐRL */}
          <div className="point-category-filter">
            <span className="filter-label">Mục ĐRL:</span>
            <div className="point-chips">
              {POINT_CATEGORIES.map(cat => {
                const count = cat === 'Tất cả Mục' 
                    ? processedPosts.length 
                    : processedPosts.filter(p => p.pointCategory === cat).length;
                return (
                  <button
                    key={cat}
                    className={`point-chip ${activePointCategory === cat ? 'active' : ''}`}
                    onClick={() => setActivePointCategory(cat)}
                  >
                    {cat} <span className="count">({count})</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tầng 1: Tab Chips */}
          <div className="tab-chips-wrap">
            <button 
              className={`tab-chip ${activeTab === 'Tất cả' ? 'active' : ''}`}
              onClick={() => handleSelectTab('Tất cả')}
            >
              Tất cả Đơn vị
            </button>
            {CATEGORIES.map((cat, idx) => {
              // Tính số bài viết của nhóm này
              const catPostCount = processedPosts.filter(p => cat.pages.includes(p.page)).length;
              return (
                <button 
                  key={idx}
                  className={`tab-chip ${activeTab === cat.name ? 'active' : ''}`}
                  onClick={() => handleSelectTab(cat.name)}
                >
                  {cat.name} <span>({catPostCount})</span>
                </button>
              )
            })}
          </div>

          {/* Tầng 2: Ghost Pill Trigger & Floating Panel */}
          {activeTab !== 'Tất cả' && (
            <div className="level-2-filter">
              
              <div className="filter-trigger-wrap" ref={panelRef}>
                <button 
                  className="filter-trigger"
                  onClick={() => setIsPanelOpen(!isPanelOpen)}
                >
                  <Filter size={14} /> Lọc theo đơn vị <ChevronDown size={14} />
                </button>

                {/* Floating Panel (Absolute) - Chip Grid */}
                {isPanelOpen && currentCategoryObj && (
                  <div className="floating-panel">
                    <div className="panel-chips">
                      <button
                        className={`panel-chip ${activeClubs.length === 0 ? 'active' : ''}`}
                        onClick={() => handleSelectClub(null)}
                      >
                        Tất cả trong nhóm <span>({processedPosts.filter(p => currentCategoryObj.pages.includes(p.page)).length})</span>
                      </button>
                      
                      {currentCategoryObj.pages.map((page, idx) => {
                        const postCount = processedPosts.filter(p => p.page === page).length;
                        const isSelected = activeClubs.includes(page);
                        return (
                          <button
                            key={idx}
                            className={`panel-chip ${isSelected ? 'active' : ''} ${postCount === 0 ? 'inactive' : ''}`}
                            onClick={() => handleSelectClub(page)}
                          >
                            {page} <span>({postCount})</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Active Badges (Hiển thị các đơn vị đã chọn) */}
          {activeClubs.length > 0 && (
            <div className="active-badges-container">
              {activeClubs.map(club => (
                <span key={club} className="active-badge">
                  {club}
                  <button className="remove-btn" onClick={() => handleSelectClub(club)} title="Bỏ lọc CLB này">
                    <X size={14} />
                  </button>
                </span>
              ))}
              {activeClubs.length > 1 && (
                <button className="clear-all-btn" onClick={() => handleSelectClub(null)}>
                  Xóa tất cả
                </button>
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
