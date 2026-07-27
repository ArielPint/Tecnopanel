import { TableBody, TableCell, TableRow } from '@/modules/financiero/components/ui/table'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'

interface TableSkeletonProps {
  columns: number
  rows?: number
}

export default function TableSkeleton({ columns, rows = 6 }: TableSkeletonProps) {
  return (
    <TableBody>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" style={{ animationDelay: `${i * 40}ms` }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  )
}
