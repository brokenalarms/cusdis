export enum UsageLabel {
  ApproveComment = 'approve_comment',
  QuickApprove = 'quick_approve',
  CreateSite = 'create_site'
}

export const usageLimitation = {
  [UsageLabel.ApproveComment]: Number.POSITIVE_INFINITY,
  [UsageLabel.QuickApprove]: Number.POSITIVE_INFINITY,
  [UsageLabel.CreateSite]: Number.POSITIVE_INFINITY,
}
