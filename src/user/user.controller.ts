import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateUser,
  TopUpRequest,
  TopUpResponse,
  TransferRequest,
  TransferResponse,
  UpdateUser,
  UserResponse,
} from 'src/model/user-module';
import { UserService } from './user.service';

@Controller('/api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async createUser(@Body() body: CreateUser): Promise<UserResponse> {
    return this.userService.createUser(body);
  }

  @Patch('/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUser,
  ): Promise<UserResponse> {
    return this.userService.updateUser({ ...body, id });
  }

  @Post('/transfer')
  async transfer(@Body() body: TransferRequest): Promise<TransferResponse> {
    return this.userService.transfer(body);
  }

  @Post('/topup')
  async topUp(@Body() body: TopUpRequest): Promise<TopUpResponse> {
    return this.userService.topUp(body);
  }

  @Get('')
  async searchUsers(
    @Query('type') type: string,
    @Query('keyword') keyword: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.userService.findUsersWithOptionalSearch(
      type,
      keyword,
      startDate,
      endDate,
    );
  }
}
