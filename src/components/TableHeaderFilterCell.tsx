import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';

export interface ColumnSortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface TableHeaderFilterCellProps {
  title: string;
  columnKey: string;
  sortable?: boolean;
  currentSort?: ColumnSortConfig | null;
  onSort?: (key: string) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterType?: 'text' | 'select';
  selectOptions?: { label: string; value: string }[];
  placeholder?: string;
  showFilterRow?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  children?: React.ReactNode;
}

export const TableHeaderFilterCell: React.FC<TableHeaderFilterCellProps> = ({
  title,
  columnKey,
  sortable = true,
  currentSort,
  onSort,
  filterValue = '',
  onFilterChange,
  filterType = 'text',
  selectOptions = [],
  placeholder = 'กรอง...',
  showFilterRow = true,
  align = 'left',
  className = '',
  children
}) => {
  const isSorted = currentSort?.key === columnKey;
  const sortDirection = isSorted ? currentSort?.direction : null;

  const alignClass = 
    align === 'center' ? 'text-center justify-center' :
    align === 'right' ? 'text-right justify-end' :
    'text-left justify-start';

  const inputAlignClass =
    align === 'center' ? 'text-center' :
    align === 'right' ? 'text-right' :
    'text-left';

  return (
    <th className={`py-2 px-3 select-none ${className}`}>
      {/* Title & Sorting */}
      <div 
        onClick={() => sortable && onSort && onSort(columnKey)}
        className={`flex items-center gap-1.5 ${alignClass} ${
          sortable ? 'cursor-pointer group hover:text-teal-900 transition-colors' : ''
        }`}
        title={sortable ? `คลิกเพื่อเรียงลำดับตาม ${title}` : undefined}
      >
        <span className="font-semibold text-slate-800 tracking-tight">
          {children || title}
        </span>
        {sortable && (
          <span className="text-slate-400 group-hover:text-teal-700 transition-colors shrink-0">
            {sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-teal-700" />
            ) : sortDirection === 'desc' ? (
              <ArrowDown className="w-3.5 h-3.5 text-teal-700" />
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-40 group-hover:opacity-100" />
            )}
          </span>
        )}
      </div>

      {/* Header Filter Input Row */}
      {showFilterRow && onFilterChange && (
        <div className="mt-1.5 font-normal">
          {filterType === 'select' ? (
            <div className="relative">
              <select
                value={filterValue}
                onChange={(e) => onFilterChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={`w-full text-[11px] py-1 px-1.5 rounded border ${
                  filterValue ? 'border-teal-500 bg-teal-50/60 font-semibold text-teal-900' : 'border-slate-300 bg-white text-slate-700'
                } focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer`}
              >
                <option value="">(ทั้งหมด)</option>
                {selectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder={placeholder}
                value={filterValue}
                onChange={(e) => onFilterChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={`w-full text-[11px] py-1 px-1.5 pr-5 rounded border ${
                  filterValue ? 'border-teal-500 bg-teal-50/60 font-semibold text-teal-900' : 'border-slate-300 bg-white text-slate-700'
                } focus:outline-none focus:ring-1 focus:ring-teal-500 ${inputAlignClass}`}
              />
              {filterValue && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilterChange('');
                  }}
                  className="absolute right-1 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="ล้างช่องค้นหานี้"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </th>
  );
};
