import { confidenceColor } from '@/lib/constants/standard-terms'
import { Badge } from '@/components/ui/Badge'

export function ConfidenceBadge({ score }: { score: number }) {
  return <Badge variant={confidenceColor(score)}>{Math.round(score)}%</Badge>
}
