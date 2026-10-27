import { useEffect, useMemo, useState } from 'react'

// simple client side paging for the tables
export default function usePaged(rows, size = 10) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const slice = useMemo(() => rows.slice((page - 1) * size, page * size), [rows, page, size])
  return { slice, page, pages, setPage, total: rows.length, size }
}
