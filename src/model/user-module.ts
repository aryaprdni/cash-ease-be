export class CreateUser {
  name: string;
  account_number: string;
  bank: string;
}

export class UpdateUser {
  id: string;
  name: string;
}

export class TransferRequest {
  senderId: string;
  recipientName: string;
  amount: number;
}

export class TransferResponse {
  transferId: string;
  senderId: string;
  recipientId: string;
  amount: number;
}

export class TopUpRequest {
  id: string;
  amount: number;
}

export class TopUpResponse {
  topUpId: string;
  userId: string;
  amount: number;
  newBalance: number;
}

export class GetAllUsersResponse {
  users: UserResponse[];
  totalUsers: number;
  totalBalance: number;
}

export class UserResponse {
  id: string;
  name: string;
  account_number: string;
  bank: string;
}
