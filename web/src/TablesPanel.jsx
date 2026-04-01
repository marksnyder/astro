import { useState, useEffect, useRef, useCallback } from 'react'
import { CategoryPicker, CategoryFilterPicker } from './CategoryTree'

function TablesPanel({ categories, universeId, onPinChange, onEditTable, refreshKey, onLoaded }) {
  const [tables, setTables] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [editingTable, setEditingTable] = useState(null)

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]))
  const catEmojiMap = Object.fromEntries(categories.map(c => [c.id, c.emoji || null]))

  const fetchTables = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (selectedCategoryId !== null) params.set('category_id', selectedCategoryId)
    if (universeId) params.set('universe_id', universeId)
    fetch(`/api/tables?${params}`)
      .then(r => r.json())
      .then(setTables)
      .catch(() => {})
      .finally(() => onLoaded?.())
  }, [search, selectedCategoryId, universeId])

  useEffect(() => { fetchTables() }, [universeId])
  useEffect(() => {
    const t = setTimeout(fetchTables, 300)
    return () => clearTimeout(t)
  }, [search, selectedCategoryId, universeId])

  useEffect(() => { fetchTables() }, [refreshKey])

  const startNew = () => {
    const t = { _new: true, universeId }
    if (onEditTable) onEditTable(t)
    else setEditingTable(t)
  }

  const startEdit = (table) => {
    if (onEditTable) onEditTable(table)
    else setEditingTable(table)
  }

  const remove = async (tableId) => {
    if (!confirm('Delete this table and all its data?')) return
    await fetch(`/api/tables/${tableId}`, { method: 'DELETE' })
    fetchTables()
    onPinChange?.()
    if (editingTable && editingTable.id === tableId) setEditingTable(null)
  }

  const togglePin = async (e, table) => {
    e.stopPropagation()
    await fetch(`/api/tables/${table.id}/pin?pinned=${!table.pinned}`, { method: 'PUT' })
    fetchTables()
    onPinChange?.()
  }

  const importNewFromCsv = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/tables/import-csv-new?universe_id=${universeId || 1}`, { method: 'POST', body: form })
      if (res.ok) {
        fetchTables()
        const data = await res.json()
        if (data.table_id) {
          fetch(`/api/tables/${data.table_id}`).then(r => r.json()).then(t => setEditingTable(t)).catch(() => {})
        }
      }
    }
    input.click()
  }

  const buildGroups = (items) => {
    const groups = []
    const groupMap = {}
    for (const item of items) {
      const key = item.category_id ?? '__none__'
      if (!(key in groupMap)) {
        const group = { categoryId: item.category_id, name: item.category_id ? (catMap[item.category_id] || 'Unknown') : null, items: [], newestAt: item.updated_at }
        groupMap[key] = group
        groups.push(group)
      }
      groupMap[key].items.push(item)
      if (item.updated_at > groupMap[key].newestAt) groupMap[key].newestAt = item.updated_at
    }
    groups.sort((a, b) => b.newestAt.localeCompare(a.newestAt))
    return groups
  }

  return (
    <aside className="markdowns-panel">
      <div className="markdowns-header">
        <span className="markdowns-header-title">Tables</span>
        <button className="markdowns-add-btn" onClick={importNewFromCsv} title="Import CSV as new table" style={{ marginRight: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button className="markdowns-add-btn" onClick={startNew} title="New table">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      <div className="markdowns-search">
        <input className="markdowns-search-input" placeholder="Search tables..." value={search} onChange={e => setSearch(e.target.value)} />
        <CategoryFilterPicker categories={categories} value={selectedCategoryId} onChange={setSelectedCategoryId} />
      </div>
      <div className="markdowns-list">
        {tables.length === 0 ? (
          <div className="markdowns-empty">{search || selectedCategoryId ? 'No matching tables.' : 'No tables yet. Click + to create one.'}</div>
        ) : buildGroups(tables).map(group => (
          <div key={group.categoryId ?? '__none__'} className="ai-group">
            <div className="ai-group-header">
              <span className="ai-group-emoji">{group.categoryId ? (catEmojiMap[group.categoryId] || '🏷️') : '🏷️'}</span>
              <span className="ai-group-name">{group.name || 'Uncategorized'}</span>
            </div>
            {group.items.map(table => {
              let colCount = 0
              try { colCount = JSON.parse(table.columns).length } catch {}
              return (
                <div key={table.id} className={`markdown-card ${editingTable?.id === table.id ? 'selected' : ''}`} onClick={() => startEdit(table)}>
                  <div className="markdown-card-header">
                    <div className="markdown-card-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, opacity: 0.5, flexShrink: 0 }}>
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                      </svg>
                      {table.title || 'Untitled'}
                    </div>
                    <button className={`pin-btn ${table.pinned ? 'pinned' : ''}`} onClick={e => togglePin(e, table)} title={table.pinned ? 'Unpin' : 'Pin'}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={table.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5" /><path d="M9 2h6l-1 7h4l-5 7H7l2-7H5l1-7z" />
                      </svg>
                    </button>
                    <button className="markdown-card-delete-btn" onClick={e => { e.stopPropagation(); remove(table.id) }} title="Delete table">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 12px 8px' }}>
                    {colCount} column{colCount !== 1 ? 's' : ''}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </aside>
  )
}


function TableEditorView({ table, categories, onSaved }) {
  const isNew = !!table?._new
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [totalRows, setTotalRows] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [rowSearch, setRowSearch] = useState('')
  const [tableId, setTableId] = useState(null)
  const [editingCell, setEditingCell] = useState(null)
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState('string')
  const [showAddCol, setShowAddCol] = useState(false)
  const titleRef = useRef(null)
  const autosaveTimer = useRef(null)
  const initRef = useRef(false)

  useEffect(() => {
    initRef.current = false
    if (isNew) {
      setTitle('')
      setCategoryId(null)
      setColumns([])
      setRows([])
      setTotalRows(0)
      setPage(1)
      setTableId(null)
      setTimeout(() => titleRef.current?.focus(), 50)
    } else if (table) {
      setTitle(table.title || '')
      setCategoryId(table.category_id)
      try { setColumns(JSON.parse(table.columns)) } catch { setColumns([]) }
      setTableId(table.id)
      setPage(1)
    }
    setTimeout(() => { initRef.current = true }, 0)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [table])

  const fetchRows = useCallback(() => {
    if (!tableId) return
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
    if (rowSearch) params.set('search', rowSearch)
    fetch(`/api/tables/${tableId}/rows?${params}`)
      .then(r => r.json())
      .then(data => { setRows(data.rows || []); setTotalRows(data.total || 0) })
      .catch(() => {})
  }, [tableId, page, pageSize, rowSearch])

  useEffect(() => { fetchRows() }, [fetchRows])

  const doSave = useCallback(async (t, cols, catId) => {
    if (!t.trim()) return
    const payload = { title: t, columns: JSON.stringify(cols), category_id: catId }
    if (tableId) {
      await fetch(`/api/tables/${tableId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      onSaved?.()
    } else {
      const res = await fetch(`/api/tables?universe_id=${table?.universeId || 1}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const created = await res.json()
      setTableId(created.id)
      onSaved?.()
    }
  }, [tableId, table, onSaved])

  useEffect(() => {
    if (!initRef.current) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => doSave(title, columns, categoryId), 800)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  }, [title, columns, categoryId, doSave])

  const addColumn = () => {
    if (!newColName.trim()) return
    setColumns(prev => [...prev, { name: newColName.trim(), type: newColType }])
    setNewColName('')
    setNewColType('string')
    setShowAddCol(false)
  }

  const removeColumn = (idx) => {
    const col = columns[idx]
    if (!confirm(`Remove column "${col.name}"? Data in this column will be lost.`)) return
    setColumns(prev => prev.filter((_, i) => i !== idx))
  }

  const addRow = async () => {
    if (!tableId) return
    const data = {}
    for (const col of columns) {
      if (col.type === 'number') data[col.name] = 0
      else if (col.type === 'boolean') data[col.name] = false
      else data[col.name] = ''
    }
    await fetch(`/api/tables/${tableId}/rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.stringify(data) }),
    })
    fetchRows()
  }

  const updateRowCell = async (row, colName, value) => {
    const rowData = JSON.parse(row.data)
    rowData[colName] = value
    await fetch(`/api/table-rows/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.stringify(rowData), sort_order: row.sort_order }),
    })
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, data: JSON.stringify(rowData) } : r))
    setEditingCell(null)
  }

  const deleteRow = async (rowId) => {
    await fetch(`/api/table-rows/${rowId}`, { method: 'DELETE' })
    fetchRows()
  }

  const exportCsv = () => {
    if (!tableId) return
    window.open(`/api/tables/${tableId}/export-csv`, '_blank')
  }

  const importCsv = () => {
    if (!tableId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const form = new FormData()
      form.append('file', file)
      await fetch(`/api/tables/${tableId}/import-csv`, { method: 'POST', body: form })
      fetchRows()
    }
    input.click()
  }

  const totalPages = Math.ceil(totalRows / pageSize) || 1

  return (
    <div className="table-editor-view">
      <div className="table-editor-header">
        <input ref={titleRef} className="markdown-title-input" placeholder="Table title..." value={title} onChange={e => setTitle(e.target.value)} />
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>

      <div className="table-columns-section">
        <div className="table-columns-header">
          <span className="table-section-label">Columns</span>
          <button className="table-small-btn" onClick={() => setShowAddCol(!showAddCol)}>
            {showAddCol ? 'Cancel' : '+ Column'}
          </button>
        </div>
        {showAddCol && (
          <div className="table-add-col-form">
            <input className="table-col-input" placeholder="Column name" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addColumn() }} autoFocus />
            <select className="table-col-type-select" value={newColType} onChange={e => setNewColType(e.target.value)}>
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
            </select>
            <button className="table-small-btn primary" onClick={addColumn} disabled={!newColName.trim()}>Add</button>
          </div>
        )}
        <div className="table-columns-list">
          {columns.map((col, i) => (
            <div key={i} className="table-column-chip">
              <span className="table-column-name">{col.name}</span>
              <span className="table-column-type">{col.type}</span>
              <button className="table-column-remove" onClick={() => removeColumn(i)} title="Remove column">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          {columns.length === 0 && <div className="table-empty-cols">No columns yet. Add columns to define your table structure.</div>}
        </div>
      </div>

      {tableId && columns.length > 0 && (
        <div className="table-data-section">
          <div className="table-data-toolbar">
            <input className="table-row-search" placeholder="Search rows..." value={rowSearch} onChange={e => { setRowSearch(e.target.value); setPage(1) }} />
            <button className="table-small-btn" onClick={addRow}>+ Row</button>
            <button className="table-small-btn" onClick={importCsv} title="Import CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Import
            </button>
            <button className="table-small-btn" onClick={exportCsv} title="Export CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Export
            </button>
          </div>

          <div className="table-grid-wrap">
            <table className="table-grid">
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i}>
                      {col.name}
                      <span className="table-th-type">{col.type === 'boolean' ? '✓' : col.type === 'number' ? '#' : 'Aa'}</span>
                    </th>
                  ))}
                  <th className="table-actions-th"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={columns.length + 1} className="table-empty-row">No rows yet. Click "+ Row" to add data.</td></tr>
                ) : rows.map(row => {
                  const rowData = (() => { try { return JSON.parse(row.data) } catch { return {} } })()
                  return (
                    <tr key={row.id}>
                      {columns.map((col, ci) => {
                        const cellKey = `${row.id}-${ci}`
                        const isEditing = editingCell === cellKey
                        const val = rowData[col.name]
                        if (col.type === 'boolean') {
                          return (
                            <td key={ci} className="table-cell table-cell-bool" onClick={() => updateRowCell(row, col.name, !val)}>
                              <input type="checkbox" checked={!!val} readOnly />
                            </td>
                          )
                        }
                        if (isEditing) {
                          return (
                            <td key={ci} className="table-cell editing">
                              <input
                                className="table-cell-input"
                                type={col.type === 'number' ? 'number' : 'text'}
                                defaultValue={val ?? ''}
                                autoFocus
                                onBlur={e => updateRowCell(row, col.name, col.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingCell(null) }}
                              />
                            </td>
                          )
                        }
                        return (
                          <td key={ci} className="table-cell" onClick={() => setEditingCell(cellKey)}>
                            {val !== undefined && val !== null && val !== '' ? String(val) : <span className="table-cell-empty">—</span>}
                          </td>
                        )
                      })}
                      <td className="table-row-actions">
                        <button className="table-row-delete" onClick={() => deleteRow(row.id)} title="Delete row">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="table-pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>Page {page} of {totalPages} ({totalRows} rows)</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { TablesPanel as default, TableEditorView }
