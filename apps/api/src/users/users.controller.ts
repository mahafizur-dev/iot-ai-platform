import { Controller, Get, NotFoundException, UseGuards } from "@nestjs/common";
import type { ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../common/types/auth.types";
import { UsersService } from "./users.service";
import { toUserProfile, type UserProfile } from "./user-profile";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async getMe(@CurrentUser() currentUser: JwtPayload): Promise<ApiSuccessResponse<UserProfile>> {
    const user = await this.usersService.findById(currentUser.sub);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return { success: true, data: toUserProfile(user, currentUser) };
  }
}
