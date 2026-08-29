import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { ApiSuccessResponse } from "@iot-ai-platform/shared-types";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../common/types/auth.types";
import { UsersService } from "../users/users.service";
import { toUserProfile, type UserProfile } from "../users/user-profile";

const REFRESH_COOKIE = "refresh_token";

interface LoginResponse {
  accessToken: string;
  user: UserProfile;
}

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccessResponse<LoginResponse>> {
    const result = await this.authService.register(dto, req.ip);
    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccessResponse<LoginResponse>> {
    const result = await this.authService.login(dto, req.ip);
    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccessResponse<LoginResponse>> {
    const result = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE]);
    this.setRefreshCookie(res, result.refreshToken);
    return { success: true, data: { accessToken: result.accessToken, user: result.user } };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiSuccessResponse<{ loggedOut: true }>> {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    return { success: true, data: { loggedOut: true } };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: JwtPayload): Promise<ApiSuccessResponse<UserProfile>> {
    const user = await this.usersService.findById(currentUser.sub);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return { success: true, data: toUserProfile(user, currentUser) };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.config.get<string>("NODE_ENV") === "production",
      sameSite: "strict",
      path: "/",
    });
  }
}
