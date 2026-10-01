// PLACEHOLDER owned by community-ui. Props are the frozen section 22 contract.
import { StarsDisplay } from "@/components/ui/stars-display";

export interface RatingWidgetProps {
  promptId: string; slug: string; ratingAvg: number | null; ratingCount: number;
  viewerRating: number | null; signedIn: boolean; isAuthor: boolean;
}

export function RatingWidget({ ratingAvg, ratingCount }: RatingWidgetProps) {
  return <StarsDisplay rating={ratingAvg} count={ratingCount} />;
}
