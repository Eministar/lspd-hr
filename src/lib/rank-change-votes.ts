export type RankChangeVoteValue = 'UP' | 'DOWN'

export interface RankChangeVoteSummary {
  upvotes: number
  downvotes: number
  currentUserVote: RankChangeVoteValue | null
}

interface StoredRankChangeVote {
  userId: string
  value: string
}

export function summarizeRankChangeVotes(
  votes: StoredRankChangeVote[],
  currentUserId: string,
): RankChangeVoteSummary {
  let upvotes = 0
  let downvotes = 0
  let currentUserVote: RankChangeVoteValue | null = null

  for (const vote of votes) {
    if (vote.value === 'UP') upvotes += 1
    if (vote.value === 'DOWN') downvotes += 1
    if (vote.userId === currentUserId && (vote.value === 'UP' || vote.value === 'DOWN')) {
      currentUserVote = vote.value
    }
  }

  return { upvotes, downvotes, currentUserVote }
}
