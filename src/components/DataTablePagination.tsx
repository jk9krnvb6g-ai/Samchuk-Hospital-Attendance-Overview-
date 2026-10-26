import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Filter,
  RotateCcw
} from 'lucide-react';

export type PageSizeOption = 10 | 50 | 100 | -1;

interface DataTablePaginationProps {
  currentPage: number;
  pageSize: PageSizeOption;
  totalItems: number;
  totalFilteredItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSizeOption) => void;
  showColumnFilters?: boolean;
  onToggleColumnFilters?: () => void;
  activeFilterCount?: number;
  onResetFilters?: () => void;
  className?: string;
}

export const DataTablePagination: React.FC<DataTablePaginationProps> = ({
  currentPage,
  pageSize,
  totalItems,
  totalFilteredItems,
  onPageChange,
  onPageSizeChange,
  showColumnFilters,
  onToggleColumnFilters,
  activeFilterCount = 0,
  onResetFilters,
  className = ''
}) => {
  const isAll = pageSize === -1;
  const effectivePageSize = isAll ? Math.max(totalFilteredItems, 1) : pageSize;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalFilteredItems / effectivePageSize));

  const startRow = totalFilteredItems === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const endRow = isAll ? totalFilteredItems : Math.min(currentPage * effectivePageSize, totalFilteredItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  return (
    <div className={`px-4 py-3 bg-white border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-700 print:hidden ${className}`}>
      {/* Left side: Page Size Selector & Filter Toggle */}
      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-start">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-medium">แสดง:</span>
          <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5">
            {([10, 50, 100, -1] as PageSizeOption[]).map((size) => {
              const active = pageSize === size;
              return (
                <button
                  key={`pagesize-${size}`}
                  type="button"
                  onClick={() => {
                    onPageSizeChange(size);
                    onPageChange(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title={size === -1 ? 'แสดงข้อมูลทั้งหมดในหน้าเดียว' : `แสดง ${size} แถวต่อหน้า`}
                >
                  {size === -1 ? 'ทั้งหมด' : size}
                </button>
              );
            })}
          </div>
          <span className="text-slate-500 font-medium">แถว / หน้า</span>
        </div>

        {/* Filter Toggle & Active Filters Indicator */}
        {onToggleColumnFilters && (
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <button
              type="button"
              onClick={onToggleColumnFilters}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                showColumnFilters
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="เปิด/ปิดช่องกรองข้อมูลที่หัวตาราง (Column Filter)"
            >
              <Filter className={`w-3.5 h-3.5 ${activeFilterCount > 0 ? 'text-teal-600 fill-teal-600/20' : 'text-slate-500'}`} />
              <span>ฟิลเตอร์หัวตาราง</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-teal-600 text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {activeFilterCount > 0 && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="flex items-center gap-1 px-2 py-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded text-xs font-medium cursor-pointer transition-colors"
                title="ล้างตัวกรองหัวตารางทั้งหมด"
              >
                <RotateCcw className="w-3 h-3" />
                <span>ล้างฟิลเตอร์</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center: Row Counter & Summary */}
      <div className="text-slate-500 text-center font-medium">
        แสดง <span className="font-bold text-slate-900 font-mono tabular-nums">{startRow}</span> ถึง{' '}
        <span className="font-bold text-slate-900 font-mono tabular-nums">{endRow}</span> จากทั้งหมด{' '}
        <span className="font-bold text-teal-800 font-mono tabular-nums">{totalFilteredItems.toLocaleString()}</span> รายการ
        {totalFilteredItems < totalItems && (
          <span className="text-slate-400 ml-1">
            (กรองจากทั้งหมด {totalItems.toLocaleString()} รายการ)
          </span>
        )}
      </div>

      {/* Right side: Page Navigation */}
      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* First Page */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="หน้าแรก"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Previous Page */}
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="หน้าก่อนหน้า"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Numbers */}
          <div className="flex items-center gap-1 px-1">
            {getPageNumbers().map((num, idx) => {
              if (num === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1 text-slate-400 font-mono">
                    ...
                  </span>
                );
              }
              const pageNum = Number(num);
              const isActive = currentPage === pageNum;
              return (
                <button
                  key={`page-${pageNum}`}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={`w-7 h-7 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-teal-700 text-white font-bold shadow-2xs'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next Page */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="หน้าถัดไป"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last Page */}
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="หน้าสุดท้าย"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
