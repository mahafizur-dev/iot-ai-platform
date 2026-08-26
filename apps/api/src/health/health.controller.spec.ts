import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get(HealthController);
  });

  it("returns a success envelope with status ok", () => {
    const result = controller.getHealth();

    expect(result.success).toBe(true);
    expect(result.data.status).toBe("ok");
    expect(typeof result.data.uptimeSeconds).toBe("number");
    expect(new Date(result.data.timestamp).toString()).not.toBe("Invalid Date");
  });
});
